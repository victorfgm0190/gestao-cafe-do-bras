// Endpoint serverless (Vercel) para aplicar o schema.sql no banco Neon.
//
// Proteção mínima: exige o header `x-setup-key: cafe-do-bras-2026`.
// Uso:
//   curl -X POST https://gestao-cafe-do-bras.vercel.app/api/setup \
//        -H "x-setup-key: cafe-do-bras-2026"
//
// Idempotente (o schema usa CREATE ... IF NOT EXISTS).

import { sql } from './db.js'
import { aplicarSchema } from './_setup-lib.js'

const CHAVE_SETUP = 'cafe-do-bras-2026'

function enviarJson(res, status, corpo) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8')
  res.send(JSON.stringify(corpo))
}

export default async function handler(req, res) {
  // Proteção mínima por header.
  if (req.headers['x-setup-key'] !== CHAVE_SETUP) {
    return enviarJson(res, 401, {
      success: false,
      message: 'Não autorizado. Header x-setup-key ausente ou inválido.',
    })
  }

  // Aceita POST (recomendado) ou GET.
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST')
    return enviarJson(res, 405, {
      success: false,
      message: `Método ${req.method} não permitido.`,
    })
  }

  try {
    const { tabelas, indices, statements } = await aplicarSchema(sql)
    return enviarJson(res, 200, {
      success: true,
      message: 'Schema aplicado',
      detalhes: { tabelas, indices, statements },
    })
  } catch (erro) {
    return enviarJson(res, 500, {
      success: false,
      message: 'Falha ao aplicar o schema.',
      erro: String(erro?.message || erro),
    })
  }
}
