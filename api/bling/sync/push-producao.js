// POST /api/bling/sync/push-producao → manda o saldo local para o Bling.
//   Corpo: { paId?, gramatura?, deposito?, confirmar? }
//   Sem `confirmar: true` a rota SIMULA: devolve o que enviaria e não escreve
//   nada no Bling.
//
// O que é enviado: SOMENTE saldo, por variação, via POST /estoques com
// operacao 'B' (balanço) — que é como o Bling v3 ajusta estoque.
// O que NÃO é enviado, de propósito: nome e preço. Um PUT em /produtos com
// corpo parcial renomearia o produto, e preço derivado de custo × margem
// sobrescreveria o preço real da loja por um número inventado — ainda por cima
// a partir de `custo_unitario`, que é por PACOTE e pode conter custo por KG
// depois de um vínculo de boleto.

import { sql, transacao } from '../../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../../_http.js'
import { exigirPermissao } from '../../_auth.js'
import { blingFetch } from '../auth.js'
import {
  buscarProdutosBling,
  garantirEstrutura,
  registrarSync,
  saldoBlingDe,
  saldosLocais,
} from './_lib.js'

const MODULO = 'Estoque PA'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'POST')) return
  const autorizado = await exigirPermissao(req, res, MODULO, 'editar')
  if (!autorizado) return

  try {
    await garantirEstrutura()
    const corpo = await lerCorpo(req)
    const confirmar = corpo.confirmar === true
    const paId = corpo.paId ? Number(corpo.paId) : null
    const gramatura = corpo.gramatura ? String(corpo.gramatura) : null
    const deposito = corpo.deposito ? Number(corpo.deposito) : null

    const mapa = await sql`
      SELECT s.produto_id, s.gramatura, s.bling_variacao_id, p.nome AS pa_nome
        FROM bling_sync_status s
        JOIN pa_cadastro p ON p.id = s.produto_id
       WHERE s.bling_variacao_id IS NOT NULL
         AND (${paId}::int IS NULL OR s.produto_id = ${paId})
         AND (${gramatura}::text IS NULL OR s.gramatura = ${gramatura})
    `
    if (mapa.length === 0) {
      return enviarErro(
        res,
        409,
        'Nada mapeado para enviar. Rode POST /api/bling/sync/mapa (ou revise os filtros).',
      )
    }

    const [locais, produtos] = await Promise.all([saldosLocais(), buscarProdutosBling()])
    const saldoLocalPorChave = new Map(
      locais.map((l) => [`${l.pa_id}|${l.gramatura}`, Number(l.saldo) || 0]),
    )
    const saldoBlingPorVariacao = new Map(produtos.map((p) => [String(p.id), saldoBlingDe(p)]))

    const itens = mapa.map((m) => {
      const chave = `${m.produto_id}|${m.gramatura}`
      const saldoLocal = saldoLocalPorChave.get(chave) ?? 0
      const saldoBling = saldoBlingPorVariacao.get(String(m.bling_variacao_id)) ?? null
      return {
        paId: m.produto_id,
        paNome: m.pa_nome,
        gramatura: m.gramatura,
        variacaoId: Number(m.bling_variacao_id),
        saldoBling,
        saldoLocal,
        diferenca: saldoBling === null ? null : saldoLocal - saldoBling,
      }
    })

    // Só faz sentido enviar o que está diferente.
    const aEnviar = itens.filter((i) => i.diferenca !== 0)

    if (!confirmar) {
      return enviarJson(res, 200, {
        simulacao: true,
        mensagem:
          aEnviar.length === 0
            ? 'Nada a enviar: o Bling já está com os mesmos saldos.'
            : `${aEnviar.length} variação(ões) seriam atualizadas no Bling. Envie confirmar: true para aplicar.`,
        total: itens.length,
        aEnviar,
        jaSincronizados: itens.length - aEnviar.length,
      })
    }

    const enviados = []
    const falhas = []
    for (const item of aEnviar) {
      try {
        const retorno = await blingFetch('/estoques', {
          method: 'POST',
          body: JSON.stringify({
            produto: { id: item.variacaoId },
            operacao: 'B', // Balanço: o saldo passa a ser exatamente este.
            quantidade: item.saldoLocal,
            ...(deposito ? { deposito: { id: deposito } } : {}),
          }),
        })
        await registrarSync({
          tipo: 'PUSH_PRODUCAO',
          produtoId: item.paId,
          gramatura: item.gramatura,
          saldoAntes: item.saldoBling,
          saldoDepois: item.saldoLocal,
          quantidadeAlterada: item.diferenca,
          origem: 'AJUSTE_MANUAL',
          status: 'SUCESSO',
          mensagem: `Saldo enviado para a variação ${item.variacaoId}`,
          usuarioId: autorizado.id,
          blingResponse: retorno?.data ?? retorno ?? null,
        })
        enviados.push(item)
      } catch (e) {
        await registrarSync({
          tipo: 'PUSH_PRODUCAO',
          produtoId: item.paId,
          gramatura: item.gramatura,
          saldoAntes: item.saldoBling,
          saldoDepois: null,
          quantidadeAlterada: item.diferenca,
          origem: 'AJUSTE_MANUAL',
          status: 'ERRO',
          mensagem: e?.message || 'Falha ao enviar',
          usuarioId: autorizado.id,
        })
        falhas.push({ ...item, erro: e?.message || 'Falha ao enviar' })
      }
    }

    if (enviados.length > 0) {
      await transacao(
        enviados.map(
          (i) => sql`
            UPDATE bling_sync_status
               SET saldo_cafe_do_bras = ${i.saldoLocal},
                   saldo_bling = ${i.saldoLocal},
                   divergencia = 0,
                   status_divergencia = 'SINCRONIZADO',
                   ultimo_sync_enviado = NOW(),
                   atualizado_em = NOW()
             WHERE produto_id = ${i.paId} AND gramatura = ${i.gramatura}
          `,
        ),
      )
    }

    return enviarJson(res, falhas.length > 0 ? 207 : 200, {
      simulacao: false,
      enviados: enviados.length,
      falhas: falhas.length,
      detalhes: enviados,
      erros: falhas,
      mensagem: `${enviados.length} variação(ões) atualizada(s) no Bling${
        falhas.length ? `, ${falhas.length} com erro` : ''
      }.`,
    })
  } catch (erro) {
    const status = erro?.status === 401 ? 401 : 502
    return enviarErro(res, status, `Falha no push de produção: ${erro?.message || erro}`)
  }
}
