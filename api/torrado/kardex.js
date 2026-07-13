// GET /api/torrado/kardex → movimentações do kardex do café torrado

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo } from '../_http.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'GET')) return
  try {
    const movimentacoes = await sql`SELECT * FROM kardex_cafe_torrado ORDER BY data ASC, id ASC`
    return enviarJson(res, 200, { movimentacoes })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao carregar o kardex: ${erro?.message || erro}`)
  }
}
