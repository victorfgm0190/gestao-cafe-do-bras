import { registrarLog, ACOES } from './auditoria'

const CHAVE = 'cafe_do_bras_auth'

// Grava a sessão do usuário logado (continua no cliente — só a autenticação vai
// ao banco). Aceita o objeto de usuário retornado pela API OU uma string legada.
// Guardamos o usuário COMPLETO (id, username, nome, perfil, permissoes,
// primeiroAcesso) e mantemos os aliases `usuario` (=nome) e `email` para os
// consumidores existentes de getUsuario()/usuarioLogado().
export function login(usuario) {
  const dados =
    typeof usuario === 'string'
      ? { usuario }
      : {
          ...usuario,
          usuario: usuario.nome,
          email: usuario.email ?? usuario.username ?? '',
          perfil: usuario.perfil,
        }
  localStorage.setItem(CHAVE, JSON.stringify(dados))
  registrarLog(dados.usuario, 'Autenticação', ACOES.LOGIN, 'Entrou no sistema')
}

export function logout() {
  const atual = getUsuario()
  if (atual?.usuario) {
    registrarLog(atual.usuario, 'Autenticação', ACOES.LOGOUT, 'Saiu do sistema')
  }
  localStorage.removeItem(CHAVE)
}

export function getUsuario() {
  try {
    const dado = localStorage.getItem(CHAVE)
    if (!dado) return null
    return JSON.parse(dado)
  } catch {
    return null
  }
}

export function estaLogado() {
  return getUsuario() !== null
}

// Atualiza campos da sessão do usuário logado sem refazer o login
// (ex.: zerar primeiroAcesso após a troca de senha).
export function atualizarSessao(campos) {
  const atual = getUsuario()
  if (!atual) return null
  const novo = { ...atual, ...campos }
  localStorage.setItem(CHAVE, JSON.stringify(novo))
  return novo
}
