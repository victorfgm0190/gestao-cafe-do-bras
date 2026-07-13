// GET /api/cafe-cru/kardex
// Lista as movimentações do kardex do café cru. Filtros opcionais na query:
//   ?lote_id=<id>   → só as movimentações vinculadas a um lote
//   ?grupo=<chave>  → só as de um grupo de custeio (ex.: "Fazenda X|Bourbon")

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo } from '../_http.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'GET')) return

  try {
    const { lote_id, grupo } = req.query

    let movimentacoes
    if (lote_id !== undefined) {
      movimentacoes = await sql`
        SELECT * FROM kardex_cafe_cru
         WHERE lote_id = ${Number(lote_id)}
         ORDER BY data ASC, id ASC
      `
    } else if (grupo !== undefined) {
      movimentacoes = await sql`
        SELECT * FROM kardex_cafe_cru
         WHERE grupo = ${String(grupo)}
         ORDER BY data ASC, id ASC
      `
    } else {
      movimentacoes = await sql`
        SELECT * FROM kardex_cafe_cru
         ORDER BY data ASC, id ASC
      `
    }

    return enviarJson(res, 200, { movimentacoes })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao carregar o kardex: ${erro?.message || erro}`)
  }
}
