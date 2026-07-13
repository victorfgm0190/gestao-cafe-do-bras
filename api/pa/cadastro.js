// GET  /api/pa/cadastro → lista os produtos acabados
// POST /api/pa/cadastro → cria um produto acabado

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../_http.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, ['GET', 'POST'])) return

  try {
    if (req.method === 'GET') {
      const produtos = await sql`SELECT * FROM pa_cadastro ORDER BY id ASC`
      return enviarJson(res, 200, { produtos })
    }

    const b = await lerCorpo(req)
    const nome = String(b.nome || '').trim()
    if (!nome) return enviarErro(res, 400, 'Informe o nome do produto.')
    const gramaturas = Array.isArray(b.gramaturas) ? b.gramaturas.map(Number) : []
    const perda = b.perdaTorraPadrao !== undefined ? Number(String(b.perdaTorraPadrao).replace(',', '.')) || 0 : 10

    const linhas = await sql`
      INSERT INTO pa_cadastro (nome, gramaturas, embalagem_250_id, embalagem_1000_id, ativo, perda_torra_padrao)
      VALUES (${nome}, ${JSON.stringify(gramaturas)}::jsonb,
              ${b.embalagem250Id ?? null}, ${b.embalagem1000Id ?? null},
              ${b.ativo !== undefined ? !!b.ativo : true}, ${perda})
      RETURNING *
    `
    return enviarJson(res, 201, { produto: linhas[0] })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao processar cadastro de PA: ${erro?.message || erro}`)
  }
}
