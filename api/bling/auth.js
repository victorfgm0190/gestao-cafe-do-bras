// OAuth2 do Bling v3 + núcleo de chamadas autenticadas à API.
// Este arquivo também é um endpoint: GET /api/bling/auth → devolve a URL de autorização.
//
// Persistência de tokens: Upstash Redis (via integração Vercel).
// Os tokens ficam no Redis, sobrevivendo a cold starts e a novos deploys:
//   bling:access_token  → TTL = expires_in (padrão 6h)
//   bling:refresh_token → TTL = 30 dias
// Quando o access_token expira, sua chave some do Redis e getToken() renova
// automaticamente usando o refresh_token.

import { Redis } from '@upstash/redis'
import { respostaSucesso, respostaErro, enviarJson, aplicarCors, garantirMetodo, esperar } from './_lib.js'

const BASE_URL = process.env.BLING_BASE_URL || 'https://www.bling.com.br/Api/v3'
// client_id e redirect_uri não são segredos (aparecem na URL de autorização) — ok ter default.
const CLIENT_ID = process.env.BLING_CLIENT_ID || 'dabc88366c8f114c52d879fda136226df634b7fc'
const REDIRECT_URI =
  process.env.BLING_REDIRECT_URI || 'https://gestao-cafe-do-bras.vercel.app/bling/callback'
// SEGREDO: só via variável de ambiente. Nunca versionar o client secret.
const CLIENT_SECRET = process.env.BLING_CLIENT_SECRET || ''

// ---- Chaves e TTLs do Redis ----
const CHAVE_ACCESS = 'bling:access_token'
const CHAVE_REFRESH = 'bling:refresh_token'
const TTL_ACCESS_PADRAO = 21600 // 6h — usado se o Bling não devolver expires_in
const TTL_REFRESH = 2592000 // 30 dias

// Cliente Redis criado sob demanda (evita quebrar getAuthUrl quando o Redis não está configurado).
let _redis = null
function getRedis() {
  if (_redis) return _redis
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!url || !token) {
    throw new Error('Upstash Redis não configurado (KV_REST_API_URL / KV_REST_API_TOKEN).')
  }
  _redis = new Redis({ url, token })
  return _redis
}

function credencialBasica() {
  if (!CLIENT_SECRET) {
    throw new Error(
      'BLING_CLIENT_SECRET não configurado. Defina a variável de ambiente na Vercel.',
    )
  }
  return Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
}

// Grava os tokens no Redis com seus TTLs.
export async function salvarTokens(accessToken, refreshToken, expiresIn) {
  const redis = getRedis()
  const ttlAccess = Number(expiresIn) > 0 ? Number(expiresIn) : TTL_ACCESS_PADRAO
  const ops = []
  if (accessToken) ops.push(redis.set(CHAVE_ACCESS, accessToken, { ex: ttlAccess }))
  if (refreshToken) ops.push(redis.set(CHAVE_REFRESH, refreshToken, { ex: TTL_REFRESH }))
  await Promise.all(ops)
}

// Lê os tokens do Redis. Faz fallback para variáveis de ambiente (semente inicial).
export async function carregarTokens() {
  const redis = getRedis()
  const [access, refresh] = await Promise.all([
    redis.get(CHAVE_ACCESS),
    redis.get(CHAVE_REFRESH),
  ])
  return {
    accessToken: access || process.env.BLING_ACCESS_TOKEN || '',
    refreshToken: refresh || process.env.BLING_REFRESH_TOKEN || '',
  }
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
  await salvarTokens(json.access_token, json.refresh_token, json.expires_in)
  return json
}

// Renova o access_token usando o refresh_token guardado no Redis.
export async function refreshToken() {
  const { refreshToken: atual } = await carregarTokens()
  if (!atual) {
    throw new Error('Sem refresh_token. Reconecte o Bling.')
  }
  const corpo = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: atual,
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
  // O Bling devolve um novo refresh_token a cada renovação; mantemos o antigo se não vier.
  await salvarTokens(json.access_token, json.refresh_token || atual, json.expires_in)
  return json
}

// Retorna um access_token válido. Se a chave do access expirou no Redis mas ainda
// há refresh_token, renova automaticamente.
export async function getToken() {
  const { accessToken, refreshToken: refresh } = await carregarTokens()
  if (accessToken) return accessToken
  if (refresh) {
    const json = await refreshToken()
    return json.access_token
  }
  throw new Error('Bling não conectado. Autorize o app primeiro.')
}

// Há uma conexão ativa? (existe refresh_token guardado)
export async function estaConectado() {
  try {
    const { refreshToken: refresh } = await carregarTokens()
    return Boolean(refresh)
  } catch {
    return false
  }
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
    const conectado = await estaConectado()
    enviarJson(res, 200, respostaSucesso({ url: getAuthUrl(), conectado }))
  } catch (e) {
    enviarJson(res, 500, respostaErro(e.message))
  }
}
