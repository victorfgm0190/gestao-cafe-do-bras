// POST /api/pa/ordens/:id/recalcular → recalcula os custos de uma ordem após o
// recálculo em cascata do café cru. O novo custo do café de cada lote vem da
// saída correspondente no kardex do cru (mov_cru_id). Devolve { antes, depois }
// por gramatura.

import { sql } from '../../../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo } from '../../../_http.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'POST')) return

  const id = Number(req.query.id)
  if (!Number.isFinite(id)) return enviarErro(res, 400, 'id inválido.')

  try {
    const ordens = await sql`SELECT * FROM ordens_producao WHERE id = ${id} LIMIT 1`
    const ordem = ordens[0]
    if (!ordem) return enviarJson(res, 200, { recalculada: false })
    if (!Array.isArray(ordem.itens) || !Array.isArray(ordem.lotes)) {
      return enviarJson(res, 200, { recalculada: false }) // legado sem estrutura
    }

    // Novo custo do café por lote = custo_unitario atual da saída no kardex do cru.
    let novoCustoTotalCru = 0
    const lotesNovos = []
    for (const l of ordem.lotes) {
      let custoNovo = Number(l.custoPorKg) || 0
      if (l.movCruId != null) {
        const mv = await sql`SELECT custo_unitario FROM kardex_cafe_cru WHERE id = ${l.movCruId} LIMIT 1`
        if (mv.length) custoNovo = Number(mv[0].custo_unitario) || custoNovo
      }
      const kg = Number(l.kg) || 0
      novoCustoTotalCru += kg * custoNovo
      lotesNovos.push({ ...l, custoPorKg: custoNovo, custoTotalLote: kg * custoNovo })
    }

    const totalKgEmbalado = Number(ordem.total_kg_embalado) || 0
    const novoCustoKgEmbalado = totalKgEmbalado > 0 ? novoCustoTotalCru / totalKgEmbalado : 0

    const antesItens = ordem.itens.map((it) => ({
      gramatura: it.gramatura,
      quantidade: it.quantidade,
      custoUnitarioTotal: Number(it.custoUnitarioTotal) || 0,
    }))

    const itensNovos = ordem.itens.map((it) => {
      const gramaturaKg = it.gramatura / 1000
      const custoUnitarioCafe = novoCustoKgEmbalado * gramaturaKg
      const custoUnitarioEmbalagem = Number(it.custoUnitarioEmbalagem) || 0 // embalagem não muda
      const custoUnitarioTotal = custoUnitarioCafe + custoUnitarioEmbalagem
      return {
        ...it,
        custoUnitarioCafe,
        custoUnitarioTotal,
        custoTotalGramatura: custoUnitarioTotal * it.quantidade,
      }
    })

    await sql`
      UPDATE ordens_producao SET
        lotes = ${JSON.stringify(lotesNovos)}::jsonb,
        custo_total_cru = ${novoCustoTotalCru},
        custo_kg_embalado = ${novoCustoKgEmbalado},
        itens = ${JSON.stringify(itensNovos)}::jsonb,
        custo_total_cafe = ${itensNovos.reduce((s, it) => s + it.custoUnitarioCafe * it.quantidade, 0)},
        custo_total = ${itensNovos.reduce((s, it) => s + it.custoTotalGramatura, 0)}
      WHERE id = ${id}
    `

    // Atualiza pa_estoque e pa_movimentacoes com o custo corrigido.
    for (const it of itensNovos) {
      if (it.paEstoqueId != null) {
        await sql`UPDATE pa_estoque SET custo_unitario = ${it.custoUnitarioTotal}, custo_total = ${it.custoTotalGramatura} WHERE id = ${it.paEstoqueId}`
      }
      if (it.paMovId != null) {
        await sql`UPDATE pa_movimentacoes SET custo_unitario = ${it.custoUnitarioTotal}, custo_total = ${it.custoTotalGramatura} WHERE id = ${it.paMovId}`
      }
    }

    return enviarJson(res, 200, {
      ordemId: ordem.id,
      data: ordem.data,
      paNome: ordem.pa_nome,
      itens: itensNovos.map((it, i) => ({
        gramatura: it.gramatura,
        quantidade: it.quantidade,
        custoUnitarioAntes: antesItens[i].custoUnitarioTotal,
        custoUnitarioDepois: it.custoUnitarioTotal,
      })),
    })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao recalcular a ordem: ${erro?.message || erro}`)
  }
}
