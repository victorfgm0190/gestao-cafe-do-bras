// Helpers compartilhados pelas funções serverless do Bling.
// Arquivos/pastas começando com "_" NÃO viram rotas na Vercel — este é só um módulo utilitário.

// Padrão de resposta da API: { sucesso, dados, erro }
export function respostaSucesso(dados) {
  return { sucesso: true, dados: dados ?? [], erro: '' }
}

export function respostaErro(mensagem) {
  return { sucesso: false, dados: [], erro: String(mensagem || 'Erro desconhecido') }
}

// Escreve JSON com o status informado.
export function enviarJson(res, status, corpo) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8')
  res.send(JSON.stringify(corpo))
}

// Garante que o método HTTP é permitido. Retorna true se pode seguir.
export function garantirMetodo(req, res, metodos) {
  const permitidos = Array.isArray(metodos) ? metodos : [metodos]
  if (!permitidos.includes(req.method)) {
    res.setHeader('Allow', permitidos.join(', '))
    enviarJson(res, 405, respostaErro(`Método ${req.method} não permitido.`))
    return false
  }
  return true
}

// SEGURANÇA: só liberamos CORS para a própria origem do app (mesma origem em produção).
// Requisições do front sempre passam pelo backend; nenhuma credencial é exposta ao cliente.
const ORIGENS_PERMITIDAS = [
  'https://gestao-cafe-do-bras.vercel.app',
  'http://localhost:5173', // vite dev
]

export function aplicarCors(req, res) {
  const origem = req.headers.origin
  if (origem && ORIGENS_PERMITIDAS.includes(origem)) {
    res.setHeader('Access-Control-Allow-Origin', origem)
  }
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  // Responde preflight imediatamente
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return true // já respondido
  }
  return false
}

// Lê o corpo JSON de uma requisição (Vercel Node já entrega req.body na maioria dos casos,
// mas garantimos o parse manual quando vier como string ou stream).
export async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body)
    } catch {
      return {}
    }
  }
  // Fallback: lê o stream
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

// Pausa (usada no retry de rate limit)
export function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
