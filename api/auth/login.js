// POST /api/auth/login
// Recebe { username, password }. Valida a senha com bcrypt e devolve o usuário
// (sem o hash) mais um token JWT. Retorna 401 se as credenciais forem inválidas.
// O token deve ser enviado nas demais rotas em `Authorization: Bearer <token>`.

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../_http.js'
import { conferirSenha, gerarToken, registrarAudit } from '../_auth.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'POST')) return

  try {
    const { username, password } = await lerCorpo(req)
    if (!username || !password) {
      return enviarErro(res, 400, 'Informe username e password.')
    }

    const ident = String(username).trim().toLowerCase()
    const linhas = await sql`
      SELECT id, username, email, nome, perfil, permissoes, primeiro_acesso,
             password_hash, ativo
        FROM usuarios
       WHERE (LOWER(username) = ${ident} OR LOWER(email) = ${ident})
         AND ativo = true
       LIMIT 1
    `

    const u = linhas[0]
    // Comparação sempre executa o bcrypt (evita vazar por timing se o user existe).
    const senhaOk = conferirSenha(password, u?.password_hash)

    if (!u || !senhaOk) {
      return enviarErro(res, 401, 'Usuário ou senha inválidos.')
    }

    await sql`UPDATE usuarios SET ultimo_acesso = NOW() WHERE id = ${u.id}`
    await registrarAudit({
      usuario: u.nome,
      acao: 'Login',
      modulo: 'Autenticação',
      detalhes: 'Entrou no sistema',
    })

    return enviarJson(res, 200, {
      success: true,
      token: gerarToken(u),
      usuario: {
        id: u.id,
        username: u.username,
        nome: u.nome,
        perfil: u.perfil,
        permissoes: u.permissoes,
        primeiro_acesso: u.primeiro_acesso,
      },
    })
  } catch (erro) {
    return enviarErro(res, 500, `Falha no login: ${erro?.message || erro}`)
  }
}
