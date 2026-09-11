// GET  /api/vinculos → lista os vínculos
// POST /api/vinculos → liga um boleto a um lote de café cru e roda a cascata
//   Corpo: { boletoId, cafeCruLoteId, insumoId? }  (aceita snake_case também)
//
// A cascata faz três coisas, todas numa transação só:
//   1. o custo do lote passa a ser o do boleto (custo_total e preco_kg), e a
//      entrada dele no kardex acompanha;
//   2. recalcularGrupo() refaz a média ponderada do grupo fazenda+variedade —
//      é a cascata que o projeto já usava para café cru;
//   3. pa_estoque.custo_unitario dos PAs que declaram esse grupo em
//      cafe_origem_ids passa a ser o custo/kg do lote.
//
// O passo 3 é o que foi pedido na Fase 3. Vale registrar que ele grava um
// custo POR KG num campo que é custo POR PACOTE: o pacote de 250 g fica com o
// mesmo custo do de 1 kg, e perda de torra e embalagem não entram. Por isso
// existe o DELETE /api/vinculos/:id, que desfaz pelo vinculo_impacto.

import { sql, transacao } from './db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from './_http.js'
import { exigirPermissao, registrarAudit } from './_auth.js'
import { chaveGrupo, recalcularGrupo } from './cafe-cru/_lib.js'

const MODULO = 'Contas a Pagar'
const q4 = (v) => Math.round(Number(v) * 10000) / 10000
const q2 = (v) => Math.round(Number(v) * 100) / 100

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, ['GET', 'POST'])) return
  const autorizado = await exigirPermissao(req, res, MODULO)
  if (!autorizado) return

  try {
    if (req.method === 'GET') return await listar(res)
    return await criar(req, res, autorizado)
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao processar vínculos: ${erro?.message || erro}`)
  }
}

async function listar(res) {
  const vinculos = await sql`
    SELECT v.id, v.boleto_id, v.cafe_cru_lote_id, v.insumo_id, v.custo_calculado,
           v.status, v.criado_por, v.criado_em, v.atualizado_em,
           b.fornecedor, b.valor_total,
           l.codigo_lote, l.fazenda, l.variedade,
           (SELECT COUNT(*) FROM vinculo_impacto i WHERE i.vinculo_id = v.id) AS impactos
      FROM vinculos v
      JOIN boletos b ON b.id = v.boleto_id
      JOIN lotes_cafe_cru l ON l.id = v.cafe_cru_lote_id
     ORDER BY v.id DESC
  `
  return enviarJson(res, 200, { vinculos })
}

async function criar(req, res, usuario) {
  const b = await lerCorpo(req)
  const boletoId = Number(b.boletoId ?? b.boleto_id)
  const loteId = Number(b.cafeCruLoteId ?? b.cafe_cru_lote_id)
  const insumoId = b.insumoId ?? b.insumo_id ?? null

  if (!Number.isInteger(boletoId) || !Number.isInteger(loteId)) {
    return enviarErro(res, 400, 'Informe boletoId e cafeCruLoteId (números inteiros).')
  }

  const [boleto] = await sql`
    SELECT id, fornecedor, valor_total, status
      FROM boletos WHERE id = ${boletoId} AND excluido_em IS NULL LIMIT 1
  `
  if (!boleto) return enviarErro(res, 404, 'Boleto não encontrado ou excluído.')
  if (boleto.status !== 'SEM_VINCULO') {
    return enviarErro(res, 409, `Boleto está como ${boleto.status}; só SEM_VINCULO pode ser vinculado.`)
  }

  const [lote] = await sql`
    SELECT id, codigo_lote, fazenda, variedade, peso_kg, custo_total, preco_kg
      FROM lotes_cafe_cru WHERE id = ${loteId} LIMIT 1
  `
  if (!lote) return enviarErro(res, 404, 'Lote de café cru não encontrado.')
  if (!(Number(lote.peso_kg) > 0)) {
    return enviarErro(res, 400, 'O lote não tem peso válido.')
  }

  const valorBoleto = Number(boleto.valor_total)
  const custoNovo = q4(valorBoleto / Number(lote.peso_kg))
  const grupo = chaveGrupo(lote.fazenda, lote.variedade)

  // Só os PAs que declaram ESTE grupo em cafe_origem_ids. O @> é contenção de
  // JSONB: casa o objeto {fazenda, variedade} dentro do array, em qualquer
  // posição. Sem esse filtro a cascata pegaria todo PA com origem preenchida.
  const movimentos = await sql`
    SELECT e.id, e.pa_id, p.nome AS pa_nome, e.gramatura, e.quantidade, e.custo_unitario
      FROM pa_estoque e
      JOIN pa_cadastro p ON p.id = e.pa_id
     WHERE p.cafe_origem_ids @> jsonb_build_array(
             jsonb_build_object('fazenda', ${lote.fazenda}::text, 'variedade', ${lote.variedade}::text)
           )
     ORDER BY e.id
  `

  // Entrada do lote no kardex: é ela que alimenta recalcularGrupo().
  const [entradaKardex] = await sql`
    SELECT id, custo_unitario FROM kardex_cafe_cru
     WHERE lote_id = ${loteId} AND tipo = 'Entrada'
     ORDER BY id LIMIT 1
  `

  // Reservamos o id antes para que TUDO caiba numa transação só — sem isso,
  // vinculo_impacto precisaria esperar o RETURNING do INSERT do vínculo.
  const [{ novo_id: vinculoId }] = await sql`
    SELECT nextval(pg_get_serial_sequence('vinculos', 'id'))::int AS novo_id
  `

  const passos = [
    sql`
      INSERT INTO vinculos (id, boleto_id, cafe_cru_lote_id, insumo_id,
                            custo_calculado, status, criado_por)
      VALUES (${vinculoId}, ${boletoId}, ${loteId}, ${insumoId},
              ${custoNovo}, 'ATIVO', ${usuario.id})
    `,
    // 1. o custo do lote passa a ser o do boleto
    sql`
      UPDATE lotes_cafe_cru
         SET custo_total = ${q2(valorBoleto)}, preco_kg = ${custoNovo}
       WHERE id = ${loteId}
    `,
    sql`
      INSERT INTO vinculo_impacto (vinculo_id, tabela_afetada, registro_id_afetado,
                                   valor_antes, valor_depois)
      VALUES (${vinculoId}, 'lotes_cafe_cru', ${loteId},
              ${q4(lote.preco_kg)}, ${custoNovo})
    `,
  ]

  if (entradaKardex) {
    passos.push(
      sql`
        UPDATE kardex_cafe_cru SET custo_unitario = ${custoNovo} WHERE id = ${entradaKardex.id}
      `,
      sql`
        INSERT INTO vinculo_impacto (vinculo_id, tabela_afetada, registro_id_afetado,
                                     valor_antes, valor_depois)
        VALUES (${vinculoId}, 'kardex_cafe_cru', ${entradaKardex.id},
                ${q4(entradaKardex.custo_unitario)}, ${custoNovo})
      `,
    )
  }

  // 3. cascata no PA
  const detalhes = []
  for (const m of movimentos) {
    const antes = q4(m.custo_unitario)
    const novoTotal = q2(custoNovo * Number(m.quantidade))
    passos.push(
      sql`
        UPDATE pa_estoque
           SET custo_unitario = ${custoNovo}, custo_total = ${novoTotal}
         WHERE id = ${m.id}
      `,
      sql`
        INSERT INTO vinculo_impacto (vinculo_id, tabela_afetada, registro_id_afetado,
                                     valor_antes, valor_depois)
        VALUES (${vinculoId}, 'pa_estoque', ${m.id}, ${antes}, ${custoNovo})
      `,
    )
    detalhes.push({
      pa_estoque_id: m.id,
      pa_id: m.pa_id,
      pa_nome: m.pa_nome,
      gramatura: m.gramatura,
      quantidade: Number(m.quantidade),
      custo_antes: antes,
      custo_depois: custoNovo,
    })
  }

  passos.push(
    sql`
      UPDATE boletos SET status = 'VINCULADO', atualizado_em = NOW() WHERE id = ${boletoId}
    `,
    // valor_antes/valor_depois são DECIMAL, então o status do boleto entra
    // codificado: 0 = SEM_VINCULO, 1 = VINCULADO.
    sql`
      INSERT INTO vinculo_impacto (vinculo_id, tabela_afetada, registro_id_afetado,
                                   valor_antes, valor_depois)
      VALUES (${vinculoId}, 'boletos', ${boletoId}, 0, 1)
    `,
  )

  await transacao(passos)

  // 2. média ponderada do grupo. Roda depois porque recalcularGrupo() abre a
  // própria transação — e é idempotente: recalcula tudo a partir do kardex.
  const resumoGrupo = await recalcularGrupo(grupo)

  await registrarAudit({
    usuario: usuario.nome,
    acao: 'Incluiu',
    modulo: MODULO,
    detalhes: `Vínculo #${vinculoId}: boleto ${boletoId} (${boleto.fornecedor}) → lote ${lote.codigo_lote} a ${custoNovo}/kg; ${detalhes.length} movimento(s) de PA recalculado(s)`,
  })

  return enviarJson(res, 201, {
    vinculo_id: vinculoId,
    boleto_id: boletoId,
    cafe_cru_lote_id: loteId,
    custo_calculado: custoNovo,
    status: 'VINCULADO',
    grupo: {
      chave: grupo,
      custo_medio: q4(resumoGrupo.custoMedio),
      saldo_kg: Number(resumoGrupo.saldoAtual),
    },
    impacto: {
      pa_afetados: new Set(detalhes.map((d) => d.pa_id)).size,
      movimentos_atualizados: detalhes.length,
      detalhes,
    },
    message: `Vínculo criado. ${detalhes.length} movimento(s) de PA atualizado(s).`,
  })
}
