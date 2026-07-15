// GET  /api/pa/cadastro → lista os produtos acabados
// POST /api/pa/cadastro → cria um produto acabado

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../_http.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, ['GET', 'POST'])) return

  try {
    // Colunas do mix de projeção e origem do café (migração idempotente).
    await sql`ALTER TABLE pa_cadastro ADD COLUMN IF NOT EXISTS mix_projecao jsonb`
    await sql`ALTER TABLE pa_cadastro ADD COLUMN IF NOT EXISTS cafe_origem_ids jsonb`

    if (req.method === 'GET') {
      const produtos = await sql`SELECT * FROM pa_cadastro ORDER BY id ASC`
      return enviarJson(res, 200, { produtos })
    }

    const b = await lerCorpo(req)
    const nome = String(b.nome || '').trim()
    if (!nome) return enviarErro(res, 400, 'Informe o nome do produto.')
    const gramaturas = Array.isArray(b.gramaturas) ? b.gramaturas.map(Number) : []
    const perda = b.perdaTorraPadrao !== undefined ? Number(String(b.perdaTorraPadrao).replace(',', '.')) || 0 : 10
    const mixProjecao = b.mixProjecao && typeof b.mixProjecao === 'object' ? b.mixProjecao : null
    const cafeOrigemIds = Array.isArray(b.cafeOrigemIds) ? b.cafeOrigemIds : null

    const linhas = await sql`
      INSERT INTO pa_cadastro
        (nome, gramaturas, embalagem_250_id, embalagem_1000_id, ativo, perda_torra_padrao,
         mix_projecao, cafe_origem_ids)
      VALUES (${nome}, ${JSON.stringify(gramaturas)}::jsonb,
              ${b.embalagem250Id ?? null}, ${b.embalagem1000Id ?? null},
              ${b.ativo !== undefined ? !!b.ativo : true}, ${perda},
              ${mixProjecao ? JSON.stringify(mixProjecao) : null}::jsonb,
              ${cafeOrigemIds ? JSON.stringify(cafeOrigemIds) : null}::jsonb)
      RETURNING *
    `
    return enviarJson(res, 201, { produto: linhas[0] })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao processar cadastro de PA: ${erro?.message || erro}`)
  }
}
