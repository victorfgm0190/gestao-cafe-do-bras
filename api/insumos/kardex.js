// GET /api/insumos/kardex[?insumo_id=<id>]
// Lista as movimentações do kardex de insumos (opcionalmente de um insumo).

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo } from '../_http.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'GET')) return

  try {
    const { insumo_id } = req.query
    const movimentacoes =
      insumo_id !== undefined
        ? await sql`SELECT * FROM kardex_insumos WHERE insumo_id = ${Number(insumo_id)} ORDER BY data ASC, id ASC`
        : await sql`SELECT * FROM kardex_insumos ORDER BY data ASC, id ASC`
    return enviarJson(res, 200, { movimentacoes })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao carregar o kardex: ${erro?.message || erro}`)
  }
}
