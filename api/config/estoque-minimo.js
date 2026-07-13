// GET /api/config/estoque-minimo → { config: { [chave]: minimo } }
// PUT /api/config/estoque-minimo → salva o mapa. Corpo: { config: { [chave]: minimo } }
//   Chaves: 'insumo:<id>', 'torrado', 'pa:<paId>:<gramatura>'.

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../_http.js'

async function lerMapa() {
  const linhas = await sql`SELECT chave, minimo FROM config_estoque_minimo`
  const mapa = {}
  for (const l of linhas) mapa[l.chave] = Number(l.minimo) || 0
  return mapa
}

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, ['GET', 'PUT'])) return

  try {
    if (req.method === 'GET') {
      return enviarJson(res, 200, { config: await lerMapa() })
    }

    const b = await lerCorpo(req)
    const config = b.config && typeof b.config === 'object' ? b.config : {}
    for (const [chave, valor] of Object.entries(config)) {
      const minimo = Number(String(valor).replace(',', '.')) || 0
      await sql`
        INSERT INTO config_estoque_minimo (chave, minimo)
        VALUES (${chave}, ${minimo})
        ON CONFLICT (chave) DO UPDATE SET minimo = EXCLUDED.minimo
      `
    }
    return enviarJson(res, 200, { config: await lerMapa() })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao salvar config: ${erro?.message || erro}`)
  }
}
