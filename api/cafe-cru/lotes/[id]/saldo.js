// POST /api/cafe-cru/lotes/:id/saldo
// Atualiza APENAS o saldo disponível (e o status) de um lote — usado pelo
// consumo/estorno de torra e produção. Não mexe no kardex nem no custo médio.

import { sql } from '../../../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../../../_http.js'

const num = (v) => Number(String(v ?? '').replace(',', '.')) || 0

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'POST')) return

  const id = Number(req.query.id)
  if (!Number.isFinite(id)) return enviarErro(res, 400, 'id inválido.')

  try {
    const b = await lerCorpo(req)
    const saldo = Math.max(0, num(b.saldoDisponivel))
    const status = b.status || (saldo > 0 ? 'disponivel' : 'esgotado')

    const linhas = await sql`
      UPDATE lotes_cafe_cru
         SET saldo_disponivel = ${saldo}, status = ${status}
       WHERE id = ${id}
       RETURNING id, saldo_disponivel, status
    `
    if (!linhas.length) return enviarErro(res, 404, 'Lote não encontrado.')
    return enviarJson(res, 200, { ok: true, lote: linhas[0] })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao atualizar o saldo: ${erro?.message || erro}`)
  }
}
