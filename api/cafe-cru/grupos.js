// GET /api/cafe-cru/grupos
// Grupos únicos de café cru (fazenda + variedade) com o saldo total disponível
// somado dos lotes. Usado para vincular origens a um produto (PA).
//   { grupos: [{ fazenda, variedade, saldoTotalDisponivel }] }

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo } from '../_http.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'GET')) return

  try {
    const linhas = await sql`
      SELECT fazenda, variedade, COALESCE(SUM(saldo_disponivel), 0) AS saldo_total_disponivel
        FROM lotes_cafe_cru
       GROUP BY fazenda, variedade
       ORDER BY fazenda, variedade
    `
    const grupos = linhas.map((l) => ({
      fazenda: l.fazenda || '',
      variedade: l.variedade || '',
      saldoTotalDisponivel: Number(l.saldo_total_disponivel) || 0,
    }))
    return enviarJson(res, 200, { grupos })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao carregar os grupos de café cru: ${erro?.message || erro}`)
  }
}
