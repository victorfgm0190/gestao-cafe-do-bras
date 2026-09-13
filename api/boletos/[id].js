// GET    /api/boletos/:id → o boleto com as parcelas
// PUT    /api/boletos/:id → edita; se o total, a quantidade ou a data de
//        entrada mudarem, as parcelas são refeitas. `vencimentos` (uma data por
//        parcela) permite datas irregulares; quando só elas mudam, as parcelas
//        são atualizadas por UPDATE, sem apagar nada — assim um pagamento já
//        lançado sobrevive à edição
// DELETE /api/boletos/:id → exclusão lógica: excluido_em = agora,
//        boleto e parcelas → CANCELADO
//
// As datas saem por to_char: DATE do Postgres pode chegar como string ou como
// Date dependendo do driver, e o resto do código compara com 'AAAA-MM-DD'.
// Os valores numeric chegam como string (o pg preserva a precisão) — por isso
// os Number() nas comparações.

import { sql, transacao } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../_http.js'
import { exigirPermissao, registrarAudit } from '../_auth.js'
import {
  hojeLocal,
  montarEdicao,
  montarVencimentos,
  vencimentosForaDeOrdem,
} from './_lib.js'

const MODULO = 'Contas a Pagar'

async function carregar(id) {
  const linhas = await sql`
    SELECT id, fornecedor, to_char(data_entrada, 'YYYY-MM-DD') AS data_entrada,
           valor_total, parcelas_quantidade, valor_parcela, status, observacoes,
           criado_em, atualizado_em, excluido_em
      FROM boletos WHERE id = ${id} LIMIT 1
  `
  return linhas[0] || null
}

async function parcelasDe(id) {
  return sql`
    SELECT id, boleto_id, numero_parcela, valor,
           to_char(data_vencimento, 'YYYY-MM-DD') AS data_vencimento,
           to_char(data_pagamento, 'YYYY-MM-DD')  AS data_pagamento,
           status, criado_em
      FROM boleto_parcelas
     WHERE boleto_id = ${id}
     ORDER BY numero_parcela
  `
}

async function contarPagas(id) {
  const r = await sql`
    SELECT COUNT(*)::int AS pagas FROM boleto_parcelas
     WHERE boleto_id = ${id} AND status = 'PAGO'
  `
  return r[0].pagas
}

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, ['GET', 'PUT', 'DELETE'])) return
  const autorizado = await exigirPermissao(req, res, MODULO)
  if (!autorizado) return

  const id = Number(req.query?.id)
  if (!Number.isInteger(id) || id <= 0) {
    return enviarErro(res, 400, 'Id de boleto inválido.')
  }

  try {
    const atual = await carregar(id)
    if (!atual) return enviarErro(res, 404, 'Boleto não encontrado.')

    if (req.method === 'GET') {
      return enviarJson(res, 200, { boleto: { ...atual, parcelas: await parcelasDe(id) } })
    }
    if (req.method === 'PUT') return await editar(req, res, atual, autorizado)
    return await cancelar(res, atual, autorizado)
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao processar o boleto: ${erro?.message || erro}`)
  }
}

async function editar(req, res, atual, usuario) {
  if (atual.excluido_em) {
    return enviarErro(res, 409, 'Boleto cancelado não pode ser editado.')
  }

  const corpo = await lerCorpo(req)
  const d = montarEdicao(corpo, atual)
  if (d.erro) return enviarErro(res, 400, d.erro)

  const parcelasAtuais = await parcelasDe(atual.id)
  const v = montarVencimentos(corpo.vencimentos, {
    qtd: d.qtd,
    dataEntrada: d.dataEntrada,
    atuais: parcelasAtuais.map((p) => p.data_vencimento),
    hoje: hojeLocal(),
  })
  if (v.erro) return enviarErro(res, 400, v.erro)
  // 'null' (e não NULL) porque o parâmetro é lido como jsonb dentro do SQL.
  const datasJson = v.vencimentos ? JSON.stringify(v.vencimentos) : 'null'

  // Mudou só a data das parcelas: dá para fazer por UPDATE, sem apagar linha
  // nenhuma — e assim pagamento já lançado sobrevive à edição.
  const soVencimentos =
    !d.regenerar &&
    v.vencimentos != null &&
    v.vencimentos.some((data, i) => data !== parcelasAtuais[i]?.data_vencimento)

  // Refazer as parcelas apaga as antigas; se alguma já foi paga, o pagamento
  // sumiria junto. Nesse caso a edição é recusada em vez de perder histórico.
  if (d.regenerar) {
    const pagas = await contarPagas(atual.id)
    if (pagas > 0) {
      return enviarErro(
        res,
        409,
        `Este boleto tem ${pagas} parcela(s) paga(s). Alterar valor, quantidade ou data de entrada refaria as parcelas e apagaria os pagamentos.`,
      )
    }
  }

  const atualizarBoleto = sql`
    UPDATE boletos
       SET fornecedor = ${d.fornecedor},
           data_entrada = ${d.dataEntrada},
           valor_total = ${d.valorTotal},
           parcelas_quantidade = ${d.qtd},
           valor_parcela = ${d.valorParcela},
           observacoes = ${d.observacoes},
           atualizado_em = NOW()
     WHERE id = ${atual.id}
  `

  if (d.regenerar) {
    // DELETE + INSERT na mesma tabela NÃO cabe num WITH: os sub-statements de
    // um CTE compartilham o snapshot e não veem o efeito um do outro, então o
    // INSERT bateria no UNIQUE (boleto_id, numero_parcela) das linhas antigas.
    // Numa transação eles são sequenciais e enxergam um ao outro.
    await transacao([
      atualizarBoleto,
      sql`DELETE FROM boleto_parcelas WHERE boleto_id = ${atual.id}`,
      sql`
        INSERT INTO boleto_parcelas (boleto_id, numero_parcela, valor, data_vencimento)
        SELECT ${atual.id}, g.i,
               CASE WHEN g.i < ${d.qtd}::int THEN ${d.valorParcela}::numeric
                    ELSE ${d.ultima}::numeric END,
               CASE
                 WHEN jsonb_typeof(${datasJson}::jsonb) = 'array'
                   THEN (${datasJson}::jsonb ->> (g.i - 1)::int)::date
                 ELSE (${d.dataEntrada}::date + (g.i || ' month')::interval)::date
               END
          FROM generate_series(1, ${d.qtd}::int) AS g(i)
      `,
    ])
  } else if (soVencimentos) {
    await transacao([
      atualizarBoleto,
      sql`
        UPDATE boleto_parcelas p
           SET data_vencimento = v.data::date
          FROM jsonb_array_elements_text(${datasJson}::jsonb) WITH ORDINALITY AS v(data, i)
         WHERE p.boleto_id = ${atual.id} AND p.numero_parcela = v.i::int
      `,
    ])
  } else {
    await transacao([atualizarBoleto])
  }

  const mudancas = []
  if (Number(d.valorTotal) !== Number(atual.valor_total)) {
    mudancas.push(`valor ${Number(atual.valor_total).toFixed(2)} → ${d.valorTotal.toFixed(2)}`)
  }
  if (Number(d.qtd) !== Number(atual.parcelas_quantidade)) {
    mudancas.push(`${atual.parcelas_quantidade}x → ${d.qtd}x`)
  }
  if (d.dataEntrada !== atual.data_entrada) {
    mudancas.push(`entrada ${atual.data_entrada} → ${d.dataEntrada}`)
  }
  if (soVencimentos) mudancas.push('vencimentos ajustados manualmente')

  await registrarAudit({
    usuario: usuario.nome,
    acao: 'Alterou',
    modulo: MODULO,
    detalhes: `Boleto #${atual.id} (${d.fornecedor})${mudancas.length ? `: ${mudancas.join('; ')}` : ''}`,
  })

  const novo = await carregar(atual.id)
  const parcelas = await parcelasDe(atual.id)
  return enviarJson(res, 200, {
    boleto: { ...novo, parcelas },
    parcelasRefeitas: d.regenerar,
    vencimentosAtualizados: soVencimentos,
    // Fora de ordem não impede de salvar; a resposta só avisa.
    aviso: vencimentosForaDeOrdem(parcelas.map((p) => p.data_vencimento))
      ? 'As parcelas não estão em ordem crescente de vencimento.'
      : null,
  })
}

async function cancelar(res, atual, usuario) {
  if (atual.excluido_em) {
    // Idempotente: cancelar de novo não é erro.
    return enviarJson(res, 200, {
      boleto: { ...atual, parcelas: await parcelasDe(atual.id) },
      mensagem: 'Boleto já estava cancelado.',
    })
  }

  const pagas = await contarPagas(atual.id)
  if (pagas > 0) {
    return enviarErro(
      res,
      409,
      `Este boleto tem ${pagas} parcela(s) paga(s) e não pode ser cancelado.`,
    )
  }

  await transacao([
    sql`
      UPDATE boletos
         SET status = 'CANCELADO', excluido_em = NOW(), atualizado_em = NOW()
       WHERE id = ${atual.id}
    `,
    sql`
      UPDATE boleto_parcelas SET status = 'CANCELADO'
       WHERE boleto_id = ${atual.id} AND status <> 'CANCELADO'
    `,
  ])

  await registrarAudit({
    usuario: usuario.nome,
    acao: 'Cancelou',
    modulo: MODULO,
    detalhes: `Boleto #${atual.id} (${atual.fornecedor}) cancelado`,
  })

  const novo = await carregar(atual.id)
  return enviarJson(res, 200, {
    boleto: { ...novo, parcelas: await parcelasDe(atual.id) },
    mensagem: 'Boleto cancelado.',
  })
}
