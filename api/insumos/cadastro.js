// GET  /api/insumos/cadastro  → lista os insumos
// POST /api/insumos/cadastro  → cria um insumo

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../_http.js'

const num = (v) => Number(String(v ?? '').replace(',', '.')) || 0

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, ['GET', 'POST'])) return

  try {
    if (req.method === 'GET') {
      const insumos = await sql`SELECT * FROM insumos_cadastro ORDER BY id ASC`
      return enviarJson(res, 200, { insumos })
    }

    const b = await lerCorpo(req)
    const nome = String(b.nome || '').trim()
    if (!nome) return enviarErro(res, 400, 'Informe o nome do insumo.')

    const linhas = await sql`
      INSERT INTO insumos_cadastro (nome, unidade, estoque_minimo, descricao)
      VALUES (${nome}, ${b.unidade || 'un'}, ${num(b.estoqueMinimo)}, ${b.descricao || null})
      RETURNING *
    `
    return enviarJson(res, 201, { insumo: linhas[0] })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao processar insumos: ${erro?.message || erro}`)
  }
}
