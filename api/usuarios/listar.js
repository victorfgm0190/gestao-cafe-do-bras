// GET /api/usuarios/listar → { sucesso, usuarios: [...] }
// Restrito ao perfil Master. Nunca devolve password_hash.

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo } from '../_http.js'
import { exigirMaster } from '../_auth.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'GET')) return
  const autorizado = await exigirMaster(req, res)
  if (!autorizado) return

  try {
    const usuarios = await sql`
      SELECT id, username, email, telefone, nome, perfil, permissoes,
             ativo, protegido, primeiro_acesso, ultimo_acesso, criado_em
        FROM usuarios
       ORDER BY criado_em DESC
    `
    return enviarJson(res, 200, { sucesso: true, usuarios })
  } catch (erro) {
    console.error('Erro ao listar usuários:', erro)
    return enviarErro(res, 500, `Falha ao listar usuários: ${erro?.message || erro}`)
  }
}
