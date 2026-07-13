// POST /api/auth/change-password
// Recebe { username, senhaAtual, novaSenha }. Valida a senha atual com bcrypt,
// grava o hash da nova senha e zera primeiro_acesso.

import bcrypt from 'bcryptjs'
import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../_http.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'POST')) return

  try {
    const { username, senhaAtual, novaSenha } = await lerCorpo(req)
    if (!username || !senhaAtual || !novaSenha) {
      return enviarErro(res, 400, 'Informe username, senhaAtual e novaSenha.')
    }
    if (String(novaSenha).length < 6) {
      return enviarErro(res, 400, 'A nova senha deve ter ao menos 6 caracteres.')
    }
    if (String(novaSenha) === String(senhaAtual)) {
      return enviarErro(res, 400, 'A nova senha deve ser diferente da atual.')
    }

    const ident = String(username).trim().toLowerCase()
    const linhas = await sql`
      SELECT id, password_hash FROM usuarios
       WHERE (LOWER(username) = ${ident} OR LOWER(email) = ${ident})
         AND ativo = true
       LIMIT 1
    `
    const u = linhas[0]
    if (!u || !bcrypt.compareSync(String(senhaAtual), u.password_hash)) {
      return enviarErro(res, 401, 'Senha atual incorreta.')
    }

    const novoHash = bcrypt.hashSync(String(novaSenha), 10)
    await sql`
      UPDATE usuarios
         SET password_hash = ${novoHash}, primeiro_acesso = false
       WHERE id = ${u.id}
    `

    return enviarJson(res, 200, { success: true })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao trocar a senha: ${erro?.message || erro}`)
  }
}
