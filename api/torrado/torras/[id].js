// DELETE /api/torrado/torras/:id → estorna uma torra:
//   devolve o peso cru ao lote, remove a saída no kardex do cru (recalcula o grupo),
//   remove a entrada no kardex do torrado (recalcula) e apaga o histórico.

import { sql } from '../../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo } from '../../_http.js'
import { recalcularTorrado } from '../_lib.js'
import { recalcularGrupo } from '../../cafe-cru/_lib.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'DELETE')) return
  const id = Number(req.query.id)
  if (!Number.isFinite(id)) return enviarErro(res, 400, 'id inválido.')

  try {
    const torras = await sql`SELECT * FROM torras_historico WHERE id = ${id} LIMIT 1`
    const torra = torras[0]
    if (!torra) return enviarErro(res, 404, 'Torra não encontrada.')

    // devolve o peso cru ao lote de origem
    if (torra.lote_id != null) {
      const lotes = await sql`SELECT saldo_disponivel FROM lotes_cafe_cru WHERE id = ${torra.lote_id} LIMIT 1`
      if (lotes.length) {
        const novoSaldo = (Number(lotes[0].saldo_disponivel) || 0) + (Number(torra.peso_cru) || 0)
        await sql`
          UPDATE lotes_cafe_cru
             SET saldo_disponivel = ${novoSaldo}, status = ${novoSaldo > 0 ? 'disponivel' : 'esgotado'}
           WHERE id = ${torra.lote_id}
        `
      }
    }

    // remove a saída no kardex do cru e recalcula o grupo dela
    if (torra.mov_cru_id != null) {
      const mov = await sql`SELECT grupo FROM kardex_cafe_cru WHERE id = ${torra.mov_cru_id} LIMIT 1`
      await sql`DELETE FROM kardex_cafe_cru WHERE id = ${torra.mov_cru_id}`
      if (mov.length) await recalcularGrupo(mov[0].grupo)
    }

    // remove a entrada no kardex do torrado e recalcula
    if (torra.mov_torrado_id != null) {
      await sql`DELETE FROM kardex_cafe_torrado WHERE id = ${torra.mov_torrado_id}`
      await recalcularTorrado()
    }

    await sql`DELETE FROM torras_historico WHERE id = ${id}`
    return enviarJson(res, 200, { deleted: true, id })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao estornar a torra: ${erro?.message || erro}`)
  }
}
