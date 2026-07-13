// Base da URL da API.
// Em produção o front e as serverless functions vivem na mesma origem (Vercel),
// então usamos caminho relativo. Em desenvolvimento (vite em localhost) o backend
// não roda local — apontamos para o deploy (o CORS libera localhost:5173).
const API_BASE =
  typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
    ? 'https://gestao-cafe-do-bras.vercel.app'
    : ''

export function apiUrl(caminho) {
  return `${API_BASE}${caminho}`
}

// GET JSON de um endpoint da API (lança em erro HTTP).
export async function getJson(caminho) {
  const res = await fetch(apiUrl(caminho))
  if (!res.ok) throw new Error(`GET ${caminho} → HTTP ${res.status}`)
  return res.json()
}

// Envia JSON (POST/PUT/DELETE) e devolve o corpo. Lança com a mensagem de erro
// do backend ({ error }) em falha HTTP.
export async function sendJson(caminho, method, body) {
  const res = await fetch(apiUrl(caminho), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `${method} ${caminho} → HTTP ${res.status}`)
  return data
}
