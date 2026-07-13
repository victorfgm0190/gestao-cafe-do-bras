// PUT    /api/insumos/cadastro/:id  → edita um insumo
// DELETE /api/insumos/cadastro/:id  → remove um insumo (cascata apaga entradas/kardex)

import { sql } from '../../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../../_http.js'

const num = (v) => Number(String(v ?? '').replace(',', '.')) || 0

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, ['PUT', 'DELETE'])) return

  const id = Number(req.query.id)
  if (!Number.isFinite(id)) return enviarErro(res, 400, 'id inválido.')

  try {
    const existentes = await sql`SELECT * FROM insumos_cadastro WHERE id = ${id} LIMIT 1`
    const insumo = existentes[0]
    if (!insumo) return enviarErro(res, 404, 'Insumo não encontrado.')

    if (req.method === 'DELETE') {
      await sql`DELETE FROM insumos_cadastro WHERE id = ${id}`
      return enviarJson(res, 200, { deleted: true, id })
    }

    const b = await lerCorpo(req)
    const linhas = await sql`
      UPDATE insumos_cadastro SET
        nome = ${b.nome !== undefined ? String(b.nome).trim() : insumo.nome},
        unidade = ${b.unidade ?? insumo.unidade},
        estoque_minimo = ${b.estoqueMinimo !== undefined ? num(b.estoqueMinimo) : insumo.estoque_minimo},
        descricao = ${b.descricao ?? insumo.descricao}
      WHERE id = ${id}
      RETURNING *
    `
    return enviarJson(res, 200, { insumo: linhas[0] })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao processar o insumo: ${erro?.message || erro}`)
  }
}
