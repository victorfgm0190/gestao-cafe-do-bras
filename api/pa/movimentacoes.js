// GET /api/pa/movimentacoes → histórico de movimentações de PA

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo } from '../_http.js'
import { exigirPermissao } from '../_auth.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'GET')) return
  const autorizado = await exigirPermissao(req, res, 'Estoque PA')
  if (!autorizado) return
  try {
    const movimentacoes = await sql`SELECT * FROM pa_movimentacoes ORDER BY data ASC, id ASC`
    return enviarJson(res, 200, { movimentacoes })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao carregar movimentações de PA: ${erro?.message || erro}`)
  }
}
