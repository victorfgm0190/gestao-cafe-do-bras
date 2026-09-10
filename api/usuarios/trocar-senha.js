// POST /api/usuarios/trocar-senha → Master redefine a senha de outro usuário.
// Corpo: { usuarioId, novaSenha, forcarTroca? }
// forcarTroca (padrão true) marca primeiro_acesso: o dono da conta é obrigado a
// trocar a senha no próximo login, então o Master não fica sabendo a senha
// definitiva de ninguém. Com false, primeiro_acesso NÃO é tocado — a senha vale
// como está e uma troca já pendente continua pendente.
// (O usuário trocando a PRÓPRIA senha usa /api/auth/change-password, que exige
// a senha atual.)

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../_http.js'
import { exigirMaster, gerarHashSenha, registrarAudit } from '../_auth.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'POST')) return
  const autorizado = await exigirMaster(req, res)
  if (!autorizado) return

  try {
    const { usuarioId, novaSenha, forcarTroca } = await lerCorpo(req)
    const forcar = forcarTroca !== false // ausente = comportamento seguro (força)

    if (!usuarioId || !novaSenha) {
      return enviarErro(res, 400, 'Informe usuarioId e novaSenha.')
    }
    if (String(novaSenha).length < 6) {
      return enviarErro(res, 400, 'A senha deve ter ao menos 6 caracteres.')
    }

    const linhas = await sql`SELECT id, username, nome FROM usuarios WHERE id = ${usuarioId} LIMIT 1`
    const u = linhas[0]
    if (!u) return enviarErro(res, 404, 'Usuário não encontrado.')

    const hash = gerarHashSenha(novaSenha)
    if (forcar) {
      await sql`
        UPDATE usuarios SET password_hash = ${hash}, primeiro_acesso = true WHERE id = ${u.id}
      `
    } else {
      await sql`UPDATE usuarios SET password_hash = ${hash} WHERE id = ${u.id}`
    }

    await registrarAudit({
      usuario: autorizado.nome,
      acao: 'Trocou a senha',
      modulo: 'Usuários',
      detalhes: `Redefiniu a senha de ${u.username}${forcar ? ' (troca obrigatória no próximo login)' : ''}`,
    })

    return enviarJson(res, 200, {
      sucesso: true,
      mensagem: forcar
        ? `Senha de ${u.nome} redefinida. Ele precisará trocá-la no próximo login.`
        : `Senha de ${u.nome} redefinida.`,
    })
  } catch (erro) {
    console.error('Erro ao trocar senha:', erro)
    return enviarErro(res, 500, `Falha ao trocar a senha: ${erro?.message || erro}`)
  }
}
