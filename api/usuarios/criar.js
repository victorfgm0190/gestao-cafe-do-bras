// POST /api/usuarios/criar → cria um usuário. Restrito ao perfil Master.
// Corpo: { username, nome, perfil, senha, email?, telefone?, permissoes? }
// Sem `permissoes` no corpo, aplica o padrão do perfil (permissoesPadrao).
// O usuário nasce com primeiro_acesso = false: a senha definida aqui já vale
// como definitiva. Para obrigar a troca no 1º login, edite o usuário e marque
// "forçar troca de senha" (ou mande primeiro_acesso em /api/usuarios/editar).

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../_http.js'
import { exigirMaster, gerarHashSenha, registrarAudit } from '../_auth.js'
import { PERFIS, permissoesPadrao } from '../_permissoes.js'

const PERFIS_VALIDOS = Object.values(PERFIS)

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'POST')) return
  const autorizado = await exigirMaster(req, res)
  if (!autorizado) return

  try {
    const { username, email, telefone, nome, perfil, senha, permissoes } = await lerCorpo(req)

    if (!username || !nome || !perfil || !senha) {
      return enviarErro(res, 400, 'Campos obrigatórios: username, nome, perfil e senha.')
    }
    if (!PERFIS_VALIDOS.includes(perfil)) {
      return enviarErro(res, 400, `Perfil inválido. Válidos: ${PERFIS_VALIDOS.join(', ')}.`)
    }
    if (String(senha).length < 6) {
      return enviarErro(res, 400, 'A senha deve ter ao menos 6 caracteres.')
    }

    const login = String(username).trim()
    // O login é comparado em minúsculas no /api/auth/login — barra o duplicado
    // que só difere de caixa, que o UNIQUE do banco deixaria passar.
    const jaExiste = await sql`
      SELECT 1 FROM usuarios WHERE LOWER(username) = ${login.toLowerCase()} LIMIT 1
    `
    if (jaExiste.length > 0) {
      return enviarErro(res, 409, `Já existe um usuário com o login "${login}".`)
    }

    const perms = permissoes && typeof permissoes === 'object' ? permissoes : permissoesPadrao(perfil)

    const linhas = await sql`
      INSERT INTO usuarios (username, email, telefone, nome, perfil, permissoes,
                            password_hash, primeiro_acesso, ativo)
      VALUES (${login}, ${email || null}, ${telefone || null}, ${nome}, ${perfil},
              ${JSON.stringify(perms)}, ${gerarHashSenha(senha)}, false, true)
      RETURNING id, username, email, telefone, nome, perfil, permissoes,
                ativo, protegido, primeiro_acesso, criado_em
    `
    const novo = linhas[0]

    await registrarAudit({
      usuario: autorizado.nome,
      acao: 'Incluiu',
      modulo: 'Usuários',
      detalhes: `Criou o usuário ${novo.username} (${novo.perfil})`,
    })

    return enviarJson(res, 201, { sucesso: true, usuario: novo })
  } catch (erro) {
    if (erro?.code === '23505') {
      return enviarErro(res, 409, 'Já existe um usuário com esse login.')
    }
    console.error('Erro ao criar usuário:', erro)
    return enviarErro(res, 500, `Falha ao criar usuário: ${erro?.message || erro}`)
  }
}
