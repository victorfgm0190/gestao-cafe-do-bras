// OAuth2 do Bling v3 + núcleo de chamadas autenticadas à API.
// Este arquivo também é um endpoint: GET /api/bling/auth → devolve a URL de autorização.
//
// IMPORTANTE sobre persistência de tokens:
// Funções serverless NÃO conseguem gravar variáveis de ambiente em runtime — o env é
// somente leitura. Mantemos os tokens num cache em memória (vive enquanto a lambda está
// "quente"), semeado a partir de BLING_ACCESS_TOKEN / BLING_REFRESH_TOKEN. Em produção,
// para persistência entre cold starts, ligue um Vercel KV / Upstash Redis nos pontos
// marcados com "PERSISTÊNCIA" abaixo.

import { respostaSucesso, respostaErro, enviarJson, aplicarCors, garantirMetodo, esperar } from './_lib.js'

const BASE_URL = process.env.BLING_BASE_URL || 'https://www.bling.com.br/Api/v3'
// client_id e redirect_uri não são segredos (aparecem na URL de autorização) — ok ter default.
const CLIENT_ID = process.env.BLING_CLIENT_ID || 'dabc88366c8f114c52d879fda136226df634b7fc'
const REDIRECT_URI =
  process.env.BLING_REDIRECT_URI || 'https://gestao-cafe-do-bras.vercel.app/bling/callback'
// SEGREDO: só via variável de ambiente. Nunca versionar o client secret.
const CLIENT_SECRET = process.env.BLING_CLIENT_SECRET || ''

// ---- Cache de tokens em memória (semeado do ambiente) ----
const store = {
  accessToken: process.env.BLING_ACCESS_TOKEN || '',
  refreshToken: process.env.BLING_REFRESH_TOKEN || '',
  expiraEm: 0, // epoch ms; 0 = desconhecido
}

function credencialBasica() {
  if (!CLIENT_SECRET) {
    throw new Error(
      'BLING_CLIENT_SECRET não configurado. Defina a variável de ambiente na Vercel.',
    )
  }
  return Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
}

function salvarTokens(dados) {
  if (dados.access_token) store.accessToken = dados.access_token
  if (dados.refresh_token) store.refreshToken = dados.refresh_token
  if (dados.expires_in) {
    // renova com 60s de folga
    store.expiraEm = Date.now() + (Number(dados.expires_in) - 60) * 1000
  }
  // PERSISTÊNCIA: aqui você gravaria store.* no Vercel KV / Redis.
}

// URL para onde mandamos o usuário autorizar o app.
export function getAuthUrl(state = 'cafe-do-bras') {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    state,
  })
  return `${BASE_URL}/oauth/authorize?${params.toString()}`
}

// Troca o "code" recebido no callback por access_token + refresh_token.
export async function exchangeCode(code) {
  const corpo = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
  })
  const resp = await fetch(`${BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credencialBasica()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: corpo.toString(),
  })
  const json = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    throw new Error(json.error_description || json.error || `Falha ao trocar o code (HTTP ${resp.status}).`)
  }
  salvarTokens(json)
  return json
}

// Renova o access_token usando o refresh_token.
export async function refreshToken() {
  if (!store.refreshToken) {
    throw new Error('Sem refresh_token. Reconecte o Bling.')
  }
  const corpo = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: store.refreshToken,
  })
  const resp = await fetch(`${BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credencialBasica()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: corpo.toString(),
  })
  const json = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    throw new Error(json.error_description || json.error || `Falha ao renovar token (HTTP ${resp.status}).`)
  }
  salvarTokens(json)
  return json
}

// Retorna um access_token válido, renovando se estiver perto de expirar.
export async function getToken() {
  if (!store.accessToken) {
    throw new Error('Bling não conectado. Autorize o app primeiro.')
  }
  if (store.expiraEm && Date.now() >= store.expiraEm) {
    await refreshToken()
  }
  return store.accessToken
}

export function estaConectado() {
  return Boolean(store.accessToken)
}

// Chamada autenticada à API do Bling com:
//  - Bearer token (renovado automaticamente em 401)
//  - retry em rate limit (429), respeitando Retry-After
// Retorna o JSON já parseado. Lança Error em falha definitiva.
export async function blingFetch(caminho, opcoes = {}, _tentativa = 0) {
  const token = await getToken()
  const url = caminho.startsWith('http') ? caminho : `${BASE_URL}${caminho}`

  const resp = await fetch(url, {
    ...opcoes,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opcoes.headers || {}),
    },
  })

  // Token expirado → renova e tenta uma vez
  if (resp.status === 401 && _tentativa === 0) {
    await refreshToken()
    return blingFetch(caminho, opcoes, _tentativa + 1)
  }

  // Rate limit → aguarda e tenta de novo (até 3x)
  if (resp.status === 429 && _tentativa < 3) {
    const retryAfter = Number(resp.headers.get('Retry-After')) || 2
    await esperar(retryAfter * 1000)
    return blingFetch(caminho, opcoes, _tentativa + 1)
  }

  const json = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    const msg =
      json?.error?.description ||
      json?.error?.message ||
      json?.error ||
      `Erro na API do Bling (HTTP ${resp.status}).`
    const erro = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
    erro.status = resp.status
    throw erro
  }
  return json
}

// ---- Endpoint: GET /api/bling/auth ----
// Devolve a URL de autorização e o status atual da conexão.
export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'GET')) return
  try {
    enviarJson(
      res,
      200,
      respostaSucesso({ url: getAuthUrl(), conectado: estaConectado() }),
    )
  } catch (e) {
    enviarJson(res, 500, respostaErro(e.message))
  }
}
