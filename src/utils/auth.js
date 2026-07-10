const CHAVE = 'cafe_do_bras_auth'

export function login(usuario) {
  localStorage.setItem(CHAVE, JSON.stringify({ usuario }))
}

export function logout() {
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
