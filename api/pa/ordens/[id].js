// DELETE /api/pa/ordens/:id → estorna uma ordem de produção:
//   devolve o café cru aos lotes + remove as saídas do kardex do cru,
//   remove a sobra torrada, devolve as embalagens (kardex de insumos) e
//   apaga os registros de estoque/movimentação/ordem de PA.

import { sql } from '../../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo } from '../../_http.js'
import { recalcularGrupo } from '../../cafe-cru/_lib.js'
import { recalcularTorrado } from '../../torrado/_lib.js'
import { recalcularInsumo } from '../../insumos/_lib.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'DELETE')) return

  const id = Number(req.query.id)
  if (!Number.isFinite(id)) return enviarErro(res, 400, 'id inválido.')

  try {
    const ordens = await sql`SELECT * FROM ordens_producao WHERE id = ${id} LIMIT 1`
    const ordem = ordens[0]
    if (!ordem) return enviarErro(res, 404, 'Ordem não encontrada.')

    // (a) devolve o café cru aos lotes + remove as saídas do kardex do cru
    for (const l of ordem.lotes || []) {
      if (l.loteId != null) {
        const lr = await sql`SELECT saldo_disponivel FROM lotes_cafe_cru WHERE id = ${l.loteId} LIMIT 1`
        if (lr.length) {
          const novoSaldo = (Number(lr[0].saldo_disponivel) || 0) + (Number(l.kg) || 0)
          await sql`
            UPDATE lotes_cafe_cru
               SET saldo_disponivel = ${novoSaldo}, status = ${novoSaldo > 0 ? 'disponivel' : 'esgotado'}
             WHERE id = ${l.loteId}
          `
        }
      }
      if (l.movCruId != null) {
        const g = await sql`SELECT grupo FROM kardex_cafe_cru WHERE id = ${l.movCruId} LIMIT 1`
        await sql`DELETE FROM kardex_cafe_cru WHERE id = ${l.movCruId}`
        if (g.length) await recalcularGrupo(g[0].grupo)
      }
    }

    // (b) remove a sobra torrada
    if (ordem.mov_torrado_id != null) {
      await sql`DELETE FROM kardex_cafe_torrado WHERE id = ${ordem.mov_torrado_id}`
      await recalcularTorrado()
    }

    // (c/d) por item: devolve embalagem + remove registros de PA
    const estoqueIds = []
    const movIds = []
    for (const it of ordem.itens || []) {
      if (it.movInsumoId != null) {
        const ir = await sql`SELECT insumo_id FROM kardex_insumos WHERE id = ${it.movInsumoId} LIMIT 1`
        await sql`DELETE FROM kardex_insumos WHERE id = ${it.movInsumoId}`
        if (ir.length) await recalcularInsumo(ir[0].insumo_id)
      }
      if (it.paEstoqueId != null) estoqueIds.push(Number(it.paEstoqueId))
      if (it.paMovId != null) movIds.push(Number(it.paMovId))
    }
    if (estoqueIds.length) await sql`DELETE FROM pa_estoque WHERE id = ANY(${estoqueIds})`
    if (movIds.length) await sql`DELETE FROM pa_movimentacoes WHERE id = ANY(${movIds})`

    // (e) remove a ordem
    await sql`DELETE FROM ordens_producao WHERE id = ${id}`
    return enviarJson(res, 200, { estornada: true, id })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao estornar a ordem: ${erro?.message || erro}`)
  }
}
