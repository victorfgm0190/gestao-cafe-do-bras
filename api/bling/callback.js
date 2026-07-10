// Recebe o retorno do Bling após a autorização do usuário.
// GET /api/bling/callback?code=XXXX  (a Vercel também roteia /bling/callback pra cá)
// Troca o code por tokens e redireciona de volta para a tela de integrações.

import { exchangeCode } from './auth.js'
import { enviarJson, respostaErro } from './_lib.js'

const DESTINO = '/integracoes/bling'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return enviarJson(res, 405, respostaErro(`Método ${req.method} não permitido.`))
  }

  const { code, error, error_description } = req.query || {}

  // Usuário negou ou o Bling devolveu erro
  if (error) {
    const msg = encodeURIComponent(error_description || error)
    res.writeHead(302, { Location: `${DESTINO}?conectado=0&erro=${msg}` })
    return res.end()
  }

  if (!code) {
    res.writeHead(302, { Location: `${DESTINO}?conectado=0&erro=${encodeURIComponent('Code ausente no retorno do Bling.')}` })
    return res.end()
  }

  try {
    await exchangeCode(code)
    // Sucesso → volta pro app conectado
    res.writeHead(302, { Location: `${DESTINO}?conectado=1` })
    res.end()
  } catch (e) {
    res.writeHead(302, {
      Location: `${DESTINO}?conectado=0&erro=${encodeURIComponent(e.message)}`,
    })
    res.end()
  }
}
