// POST /api/pa/seed  (header x-setup-key: cafe-do-bras-2026)
// Semeia os 5 produtos acabados iniciais, vinculando as embalagens 250g/1kg
// pelos ids reais dos insumos. Idempotente (checagem por nome).

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro } from '../_http.js'

const CHAVE_SETUP = 'cafe-do-bras-2026'
const NOMES = ['Chocolatudo', 'Frutado e Floral', 'Garapa com Limão', 'Monstro do Lago Ness', 'Pyta']

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (req.headers['x-setup-key'] !== CHAVE_SETUP) {
    return enviarErro(res, 401, 'Não autorizado. Header x-setup-key ausente ou inválido.')
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST')
    return enviarErro(res, 405, `Método ${req.method} não permitido.`)
  }

  try {
    const emb250 = (await sql`SELECT id FROM insumos_cadastro WHERE nome = 'Embalagem 250g' LIMIT 1`)[0]?.id ?? null
    const emb1000 = (await sql`SELECT id FROM insumos_cadastro WHERE nome = 'Embalagem 1kg' LIMIT 1`)[0]?.id ?? null

    let criados = 0
    for (const nome of NOMES) {
      const linhas = await sql`
        INSERT INTO pa_cadastro (nome, gramaturas, embalagem_250_id, embalagem_1000_id, ativo)
        SELECT ${nome}, ${JSON.stringify([250, 1000])}::jsonb, ${emb250}, ${emb1000}, true
        WHERE NOT EXISTS (SELECT 1 FROM pa_cadastro WHERE nome = ${nome})
        RETURNING id
      `
      if (linhas.length) criados += 1
    }
    return enviarJson(res, 200, {
      success: true,
      message: `${criados} produto(s) criado(s); ${NOMES.length - criados} já existia(m).`,
      criados,
      embalagens: { emb250, emb1000 },
    })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao semear PA: ${erro?.message || erro}`)
  }
}
