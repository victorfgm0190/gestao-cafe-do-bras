// POST /api/auth/change-password
// Recebe { senhaAtual, novaSenha }. Exige token (o usuário já fez login, mesmo
// no primeiro acesso). Valida a senha atual com bcrypt, grava o hash da nova e
// zera primeiro_acesso. O usuário alterado é SEMPRE o dono do token.

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../_http.js'
import { conferirSenha, gerarHashSenha, exigirAutenticacao, registrarAudit } from '../_auth.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'POST')) return

  const sessao = exigirAutenticacao(req, res)
  if (!sessao) return

  try {
    const { senhaAtual, novaSenha } = await lerCorpo(req)
    if (!senhaAtual || !novaSenha) {
      return enviarErro(res, 400, 'Informe senhaAtual e novaSenha.')
    }
    if (String(novaSenha).length < 6) {
      return enviarErro(res, 400, 'A nova senha deve ter ao menos 6 caracteres.')
    }
    if (String(novaSenha) === String(senhaAtual)) {
      return enviarErro(res, 400, 'A nova senha deve ser diferente da atual.')
    }

    const linhas = await sql`
      SELECT id, nome, password_hash FROM usuarios
       WHERE id = ${sessao.sub} AND ativo = true
       LIMIT 1
    `
    const u = linhas[0]
    if (!u || !conferirSenha(senhaAtual, u.password_hash)) {
      return enviarErro(res, 401, 'Senha atual incorreta.')
    }

    await sql`
      UPDATE usuarios
         SET password_hash = ${gerarHashSenha(novaSenha)}, primeiro_acesso = false
       WHERE id = ${u.id}
    `
    await registrarAudit({
      usuario: u.nome,
      acao: 'Trocou a senha',
      modulo: 'Autenticação',
      detalhes: 'Senha alterada pelo próprio usuário',
    })

    return enviarJson(res, 200, { success: true })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao trocar a senha: ${erro?.message || erro}`)
  }
}
