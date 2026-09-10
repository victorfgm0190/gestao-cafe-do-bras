// PUT /api/usuarios/editar → atualiza um usuário. Restrito ao perfil Master.
// Corpo: { id, nome?, email?, telefone?, perfil?, permissoes?, ativo?, primeiro_acesso? }
// primeiro_acesso = true obriga o usuário a trocar a senha no próximo login.
// Só os campos presentes no corpo são alterados (mandar '' limpa o campo).
// O username não muda: é a identidade do login.

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../_http.js'
import { exigirMaster, registrarAudit } from '../_auth.js'
import { PERFIS, permissoesPadrao } from '../_permissoes.js'

const PERFIS_VALIDOS = Object.values(PERFIS)

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'PUT')) return
  const autorizado = await exigirMaster(req, res)
  if (!autorizado) return

  try {
    const corpo = await lerCorpo(req)
    const { id, nome, email, telefone, perfil, permissoes, ativo } = corpo
    const primeiroAcesso = corpo.primeiro_acesso

    if (!id) return enviarErro(res, 400, 'Informe o id do usuário.')
    if (perfil !== undefined && !PERFIS_VALIDOS.includes(perfil)) {
      return enviarErro(res, 400, `Perfil inválido. Válidos: ${PERFIS_VALIDOS.join(', ')}.`)
    }

    const atual = await sql`SELECT * FROM usuarios WHERE id = ${id} LIMIT 1`
    const u = atual[0]
    if (!u) return enviarErro(res, 404, 'Usuário não encontrado.')

    const desativando = ativo === false && u.ativo === true
    if (desativando && u.protegido) {
      return enviarErro(res, 403, 'Este usuário é protegido e não pode ser desativado.')
    }
    // Sem isto o Master consegue se trancar para fora do próprio sistema.
    if (Number(id) === Number(autorizado.id)) {
      if (desativando) {
        return enviarErro(res, 403, 'Você não pode desativar a si mesmo.')
      }
      if (perfil !== undefined && perfil !== PERFIS.MASTER) {
        return enviarErro(res, 403, 'Você não pode remover o próprio perfil Master.')
      }
    }

    // Só sobrescreve o que veio no corpo — ausente mantém o valor atual.
    const presente = (chave) => Object.prototype.hasOwnProperty.call(corpo, chave)
    const novoPerfil = presente('perfil') ? perfil : u.perfil
    const novasPerms = presente('permissoes')
      ? permissoes
      : presente('perfil') && perfil !== u.perfil
        ? permissoesPadrao(perfil) // trocou de perfil sem mandar matriz: aplica o padrão novo
        : u.permissoes

    const linhas = await sql`
      UPDATE usuarios
         SET nome       = ${presente('nome') ? nome : u.nome},
             email      = ${presente('email') ? email || null : u.email},
             telefone   = ${presente('telefone') ? telefone || null : u.telefone},
             perfil     = ${novoPerfil},
             permissoes = ${JSON.stringify(novasPerms || {})},
             ativo      = ${presente('ativo') ? Boolean(ativo) : u.ativo},
             primeiro_acesso = ${
               presente('primeiro_acesso') ? Boolean(primeiroAcesso) : u.primeiro_acesso
             }
       WHERE id = ${id}
      RETURNING id, username, email, telefone, nome, perfil, permissoes,
                ativo, protegido, primeiro_acesso, ultimo_acesso, criado_em
    `
    const editado = linhas[0]

    const mudancas = []
    if (editado.perfil !== u.perfil) mudancas.push(`perfil ${u.perfil} → ${editado.perfil}`)
    if (editado.ativo !== u.ativo) mudancas.push(editado.ativo ? 'reativado' : 'desativado')
    if (editado.primeiro_acesso && !u.primeiro_acesso) mudancas.push('troca de senha obrigatória')

    await registrarAudit({
      usuario: autorizado.nome,
      acao: 'Alterou',
      modulo: 'Usuários',
      detalhes: `Editou o usuário ${editado.username}${mudancas.length ? ` (${mudancas.join('; ')})` : ''}`,
    })

    return enviarJson(res, 200, { sucesso: true, usuario: editado })
  } catch (erro) {
    console.error('Erro ao editar usuário:', erro)
    return enviarErro(res, 500, `Falha ao editar usuário: ${erro?.message || erro}`)
  }
}
