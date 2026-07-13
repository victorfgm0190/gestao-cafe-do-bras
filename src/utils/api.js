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
