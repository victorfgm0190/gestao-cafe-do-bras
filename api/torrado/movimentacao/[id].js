// DELETE /api/torrado/movimentacao/:id → remove movimentação do kardex do torrado
// e reprocessa. Usada no estorno da sobra de Ordem de Produção.

import { sql } from '../../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo } from '../../_http.js'
import { recalcularTorrado } from '../_lib.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'DELETE')) return
  const id = Number(req.query.id)
  if (!Number.isFinite(id)) return enviarErro(res, 400, 'id inválido.')
  try {
    const alvo = await sql`SELECT id FROM kardex_cafe_torrado WHERE id = ${id} LIMIT 1`
    if (!alvo.length) return enviarErro(res, 404, 'Movimentação não encontrada.')
    await sql`DELETE FROM kardex_cafe_torrado WHERE id = ${id}`
    const resumo = await recalcularTorrado()
    return enviarJson(res, 200, { deleted: true, id, resumo })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao remover a movimentação: ${erro?.message || erro}`)
  }
}
