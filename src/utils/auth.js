import { registrarLog, ACOES } from './auditoria'

const CHAVE = 'cafe_do_bras_auth'
const CHAVE_TOKEN = 'cafe_do_bras_token'

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
  // O token JWT fica numa chave separada; sem ele a API responde 401.
  if (dados.token) {
    localStorage.setItem(CHAVE_TOKEN, dados.token)
    delete dados.token
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
  localStorage.removeItem(CHAVE_TOKEN)
}

// Token JWT da sessão atual (enviado pelo api.js em Authorization: Bearer).
export function getToken() {
  try {
    return localStorage.getItem(CHAVE_TOKEN) || null
  } catch {
    return null
  }
}

// Encerra a sessão sem registrar log (usado quando a API devolve 401 — o token
// já expirou, então não há sessão válida para auditar).
export function encerrarSessaoExpirada() {
  localStorage.removeItem(CHAVE)
  localStorage.removeItem(CHAVE_TOKEN)
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
  // Exige token: sessões antigas (anteriores ao JWT) precisam refazer o login,
  // senão o app abriria e todas as chamadas de API voltariam 401.
  return getUsuario() !== null && getToken() !== null
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
