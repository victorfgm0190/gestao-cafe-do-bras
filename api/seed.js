// Endpoint serverless (Vercel) para semear o usuário admin inicial.
//
// Proteção mínima: header `x-setup-key: cafe-do-bras-2026`.
// Uso:
//   curl -X POST https://gestao-cafe-do-bras.vercel.app/api/seed \
//        -H "x-setup-key: cafe-do-bras-2026"
//
// Idempotente: usa ON CONFLICT (username) DO NOTHING — não duplica o admin.

import bcrypt from 'bcryptjs'
import { sql } from './db.js'
import { aplicarCors, enviarJson, enviarErro } from './_http.js'
import { PERFIS, permissoesPadrao } from './_permissoes.js'

const CHAVE_SETUP = 'cafe-do-bras-2026'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return

  if (req.headers['x-setup-key'] !== CHAVE_SETUP) {
    return enviarErro(res, 401, 'Não autorizado. Header x-setup-key ausente ou inválido.')
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST')
    return enviarErro(res, 405, `Método ${req.method} não permitido.`)
  }

  try {
    // bcrypt com salt 10 (padrão seguro).
    const passwordHash = bcrypt.hashSync('admin', 10)
    const permissoes = JSON.stringify(permissoesPadrao(PERFIS.MASTER))

    const linhas = await sql`
      INSERT INTO usuarios
        (username, email, telefone, password_hash, nome, perfil, permissoes,
         primeiro_acesso, protegido, ativo)
      VALUES
        ('admin', 'admin@cafedobras.com.br', '', ${passwordHash}, 'Administrador',
         ${PERFIS.MASTER}, ${permissoes}::jsonb, true, true, true)
      ON CONFLICT (username) DO NOTHING
      RETURNING id
    `

    const criado = linhas.length > 0
    return enviarJson(res, 200, {
      success: true,
      message: criado ? 'Usuário admin criado.' : 'Usuário admin já existia (nada a fazer).',
      criado,
    })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao semear admin: ${erro?.message || erro}`)
  }
}
