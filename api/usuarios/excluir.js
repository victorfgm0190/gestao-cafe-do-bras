// DELETE /api/usuarios/excluir → remove um usuário. Restrito ao perfil Master.
// Corpo: { id }
// Usuário protegido e a própria conta não podem ser removidos. O audit_log
// guarda o nome em texto (sem FK), então o histórico sobrevive à exclusão.

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../_http.js'
import { exigirMaster, registrarAudit } from '../_auth.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'DELETE')) return
  const autorizado = await exigirMaster(req, res)
  if (!autorizado) return

  try {
    const { id } = await lerCorpo(req)
    if (!id) return enviarErro(res, 400, 'Informe o id do usuário.')

    const linhas = await sql`SELECT id, username, nome, protegido FROM usuarios WHERE id = ${id} LIMIT 1`
    const u = linhas[0]
    if (!u) return enviarErro(res, 404, 'Usuário não encontrado.')
    if (u.protegido) return enviarErro(res, 403, 'Este usuário é protegido e não pode ser excluído.')
    if (Number(id) === Number(autorizado.id)) {
      return enviarErro(res, 403, 'Você não pode excluir a si mesmo.')
    }

    await sql`DELETE FROM usuarios WHERE id = ${u.id}`

    await registrarAudit({
      usuario: autorizado.nome,
      acao: 'Excluiu',
      modulo: 'Usuários',
      detalhes: `Excluiu o usuário ${u.username} (${u.nome})`,
    })

    return enviarJson(res, 200, { sucesso: true })
  } catch (erro) {
    console.error('Erro ao excluir usuário:', erro)
    return enviarErro(res, 500, `Falha ao excluir usuário: ${erro?.message || erro}`)
  }
}
