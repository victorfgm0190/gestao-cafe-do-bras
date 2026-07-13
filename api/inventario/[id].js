// GET    /api/inventario/:id → um inventário
// PUT    /api/inventario/:id → salva o inventário (contagens/itens/status)
// DELETE /api/inventario/:id → exclui um inventário

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../_http.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, ['GET', 'PUT', 'DELETE'])) return

  const id = Number(req.query.id)
  if (!Number.isFinite(id)) return enviarErro(res, 400, 'id inválido.')

  try {
    const existentes = await sql`SELECT * FROM inventarios WHERE id = ${id} LIMIT 1`
    const inv = existentes[0]
    if (!inv) return enviarErro(res, 404, 'Inventário não encontrado.')

    if (req.method === 'GET') {
      return enviarJson(res, 200, { inventario: inv })
    }
    if (req.method === 'DELETE') {
      await sql`DELETE FROM inventarios WHERE id = ${id}`
      return enviarJson(res, 200, { deleted: true, id })
    }

    // PUT — salva itens/status
    const b = await lerCorpo(req)
    const itens = Array.isArray(b.itens) ? b.itens : inv.itens
    const linhas = await sql`
      UPDATE inventarios SET
        itens = ${JSON.stringify(itens)}::jsonb,
        status = ${b.status ?? inv.status},
        concluido_em = ${b.concluidoEm ?? inv.concluido_em}
      WHERE id = ${id}
      RETURNING *
    `
    return enviarJson(res, 200, { inventario: linhas[0] })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao processar o inventário: ${erro?.message || erro}`)
  }
}
