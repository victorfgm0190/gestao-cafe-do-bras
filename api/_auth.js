// Autenticação (JWT) e autorização das serverless functions.
// Arquivos começando com "_" NÃO viram rotas.
//
// Fluxo:
//   1. /api/auth/login confere a senha com bcrypt e chama gerarToken().
//   2. O front guarda o token e o envia em `Authorization: Bearer <token>`.
//   3. Cada rota chama exigirAutenticacao() ou exigirPermissao() no início.
//
// O token carrega só identificação (id, username, nome, perfil). Perfil e
// permissões usados nas checagens vêm SEMPRE do banco, para que uma alteração
// de acesso valha na hora, sem esperar o token expirar.

import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { sql } from './db.js'
import { PERFIS } from './_permissoes.js'

const { JWT_SECRET, JWT_EXPIRY } = process.env

if (!JWT_SECRET) {
  // Falha cedo e com mensagem clara — sem o segredo não há como assinar sessões.
  throw new Error(
    'JWT_SECRET não configurada. Defina um segredo longo e aleatório no painel da Vercel (e em .env local).',
  )
}

// Aceita '24h'/'7d' (formato do jsonwebtoken) ou um número de segundos.
// '86400' puro seria lido como 86400 MILISSEGUNDOS pela lib — por isso a conversão.
const EXPIRACAO = /^\d+$/.test(String(JWT_EXPIRY || '')) ? Number(JWT_EXPIRY) : JWT_EXPIRY || '24h'

// Hash de referência usado quando o usuário não existe: mantém o custo do
// bcrypt constante e evita descobrir logins válidos pelo tempo de resposta.
export const HASH_INVALIDO = '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinv'

// Recusa a requisição (401/403). O projeto tem DOIS formatos de resposta de
// erro — { error } em api/_http.js e { sucesso, erro } em api/bling/_lib.js —
// e as guardas valem para os dois, então o corpo traz as duas chaves.
function negar(res, status, mensagem) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8')
  res.send(JSON.stringify({ error: mensagem, erro: mensagem, sucesso: false, dados: [] }))
  return null
}

/* ---------- Senha ---------- */
export function gerarHashSenha(senha) {
  return bcrypt.hashSync(String(senha), 10)
}

export function conferirSenha(senha, hash) {
  return bcrypt.compareSync(String(senha), hash || HASH_INVALIDO)
}

/* ---------- Token ---------- */
// Assina a sessão de um usuário já autenticado.
export function gerarToken(usuario) {
  return jwt.sign(
    {
      sub: usuario.id,
      username: usuario.username,
      nome: usuario.nome,
      perfil: usuario.perfil,
    },
    JWT_SECRET,
    { expiresIn: EXPIRACAO },
  )
}

// Lê e valida o Bearer token do request. Retorna o payload ou null.
export function lerToken(req) {
  const cabecalho = req.headers?.authorization || req.headers?.Authorization || ''
  const token = /^Bearer\s+/i.test(cabecalho) ? cabecalho.replace(/^Bearer\s+/i, '').trim() : ''
  if (!token) return null
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch {
    return null // expirado, adulterado ou assinado com outro segredo
  }
}

/* ---------- Guardas de rota ---------- */
// Exige um token válido. Retorna o payload, ou null APÓS já ter respondido 401
// — o chamador só precisa fazer `if (!sessao) return`.
export function exigirAutenticacao(req, res) {
  const sessao = lerToken(req)
  if (!sessao) return negar(res, 401, 'Sessão expirada ou ausente. Faça login novamente.')
  return sessao
}

// Carrega o usuário do banco (perfil e permissões sempre atuais).
export async function carregarUsuario(usuarioId) {
  const linhas = await sql`
    SELECT id, username, email, nome, perfil, permissoes, protegido, ultimo_acesso
      FROM usuarios
     WHERE id = ${usuarioId} AND ativo = true
     LIMIT 1
  `
  return linhas[0] || null
}

export function ehMaster(usuario) {
  return usuario?.perfil === PERFIS.MASTER
}

// Tipo de permissão exigido por método HTTP (ver PERMISSOES em _permissoes.js).
const TIPO_POR_METODO = {
  GET: 'visualizar',
  HEAD: 'visualizar',
  POST: 'incluir',
  PUT: 'editar',
  PATCH: 'editar',
  DELETE: 'excluir',
}

// Exige token válido + permissão no módulo. `tipo` default vem do método HTTP;
// passe explícito quando a rota não seguir a convenção (ex.: um POST que só
// calcula uma prévia exige 'visualizar', não 'incluir').
// Retorna o usuário do banco, ou null APÓS já ter respondido 401/403.
export async function exigirPermissao(req, res, modulo, tipo) {
  const sessao = exigirAutenticacao(req, res)
  if (!sessao) return null

  const usuario = await carregarUsuario(sessao.sub)
  if (!usuario) return negar(res, 401, 'Usuário inativo ou removido. Faça login novamente.')

  if (ehMaster(usuario)) return usuario // Master não tem restrição

  const exigido = tipo || TIPO_POR_METODO[req.method] || 'visualizar'
  const doModulo = usuario.permissoes?.[modulo]
  if (doModulo?.[exigido] !== true) {
    return negar(res, 403, `Sem permissão para ${exigido} em ${modulo}.`)
  }
  return usuario
}

// Exige que o usuário seja Master (rotas administrativas).
export async function exigirMaster(req, res) {
  const sessao = exigirAutenticacao(req, res)
  if (!sessao) return null
  const usuario = await carregarUsuario(sessao.sub)
  if (!ehMaster(usuario)) return negar(res, 403, 'Ação restrita ao perfil Master.')
  return usuario
}

/* ---------- Auditoria ---------- */
// Grava no audit_log (append-only, criado pelo schema.sql — não criamos tabela
// em runtime). Nunca derruba a requisição: falha de log só vai para o console.
export async function registrarAudit({ usuario, acao, modulo = null, detalhes = '' }) {
  try {
    await sql`
      INSERT INTO audit_log (usuario, acao, modulo, detalhes)
      VALUES (${usuario || 'sistema'}, ${acao}, ${modulo}, ${detalhes})
    `
  } catch (erro) {
    console.error('Falha ao registrar auditoria:', erro?.message || erro)
  }
}
