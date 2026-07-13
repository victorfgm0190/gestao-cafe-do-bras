// DELETE /api/insumos/movimentacao/:id
// Remove uma movimentação do kardex de insumos e reprocessa o custo médio.
// Usada no estorno de Ordem de Produção (devolução de embalagem).

import { sql } from '../../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo } from '../../_http.js'
import { recalcularInsumo } from '../_lib.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'DELETE')) return

  const id = Number(req.query.id)
  if (!Number.isFinite(id)) return enviarErro(res, 400, 'id inválido.')

  try {
    const alvo = await sql`SELECT insumo_id FROM kardex_insumos WHERE id = ${id} LIMIT 1`
    if (!alvo.length) return enviarErro(res, 404, 'Movimentação não encontrada.')

    const insumoId = alvo[0].insumo_id
    await sql`DELETE FROM kardex_insumos WHERE id = ${id}`
    const resumo = await recalcularInsumo(insumoId)
    return enviarJson(res, 200, { deleted: true, id, resumo })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao remover a movimentação: ${erro?.message || erro}`)
  }
}
