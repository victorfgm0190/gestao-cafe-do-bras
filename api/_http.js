// Helpers HTTP compartilhados pelos endpoints serverless (Vercel).
// Arquivos começando com "_" NÃO viram rotas.

// SEGURANÇA: CORS liberado apenas para a origem do próprio app.
const ORIGENS_PERMITIDAS = [
  'https://gestao-cafe-do-bras.vercel.app',
  'http://localhost:5173', // vite dev
]

// Aplica os headers de CORS. Retorna true se já respondeu o preflight (OPTIONS).
export function aplicarCors(req, res) {
  const origem = req.headers.origin
  if (origem && ORIGENS_PERMITIDAS.includes(origem)) {
    res.setHeader('Access-Control-Allow-Origin', origem)
  }
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-setup-key')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return true
  }
  return false
}

// Escreve JSON com o status informado.
export function enviarJson(res, status, corpo) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8')
  res.send(JSON.stringify(corpo))
}

// Atalho para resposta de erro: { error: mensagem }.
export function enviarErro(res, status, mensagem) {
  enviarJson(res, status, { error: String(mensagem || 'Erro desconhecido') })
}

// Garante que o método é permitido; responde 405 e retorna false caso contrário.
export function garantirMetodo(req, res, metodos) {
  const permitidos = Array.isArray(metodos) ? metodos : [metodos]
  if (!permitidos.includes(req.method)) {
    res.setHeader('Allow', permitidos.join(', '))
    enviarErro(res, 405, `Método ${req.method} não permitido.`)
    return false
  }
  return true
}

// Lê o corpo JSON da requisição (Vercel Node normalmente já entrega req.body).
export async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body)
    } catch {
      return {}
    }
  }
  return await new Promise((resolve) => {
    let bruto = ''
    req.on('data', (c) => (bruto += c))
    req.on('end', () => {
      try {
        resolve(bruto ? JSON.parse(bruto) : {})
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}
