// POST /api/inventario/:id/concluir → conclui o inventário (exige tudo regularizado).
// Corpo opcional: { itens } (contagens atuais), { quando }

import { sql } from '../../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../../_http.js'
import { resumoInventario } from '../_lib.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'POST')) return

  const id = Number(req.query.id)
  if (!Number.isFinite(id)) return enviarErro(res, 400, 'id inválido.')

  try {
    const invRows = await sql`SELECT * FROM inventarios WHERE id = ${id} LIMIT 1`
    const inv = invRows[0]
    if (!inv) return enviarErro(res, 404, 'Inventário não encontrado.')

    const b = await lerCorpo(req)
    const itens = Array.isArray(b.itens) ? b.itens : inv.itens || []
    const r = resumoInventario({ itens })
    if (!r.tudoRegularizado) {
      // Persiste os itens mas não conclui.
      const linhas = await sql`
        UPDATE inventarios SET itens = ${JSON.stringify(itens)}::jsonb WHERE id = ${id} RETURNING *
      `
      return enviarJson(res, 200, { inventario: linhas[0], concluido: false })
    }

    const quando = b.quando || new Date().toISOString().slice(0, 10)
    const linhas = await sql`
      UPDATE inventarios SET
        itens = ${JSON.stringify(itens)}::jsonb, status = 'Concluído', concluido_em = ${quando}
      WHERE id = ${id}
      RETURNING *
    `
    return enviarJson(res, 200, { inventario: linhas[0], concluido: true })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao concluir: ${erro?.message || erro}`)
  }
}
