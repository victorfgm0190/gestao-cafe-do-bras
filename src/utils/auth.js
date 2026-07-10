import { registrarLog, ACOES } from './auditoria'

const CHAVE = 'cafe_do_bras_auth'

// Aceita uma string (legado: nome/usuário) ou um objeto { nome, email, perfil }.
export function login(usuario) {
  const dados =
    typeof usuario === 'string'
      ? { usuario }
      : { usuario: usuario.nome, email: usuario.email, perfil: usuario.perfil }
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
