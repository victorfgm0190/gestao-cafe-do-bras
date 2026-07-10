const CHAVE_AUDITORIA = 'cafe_do_bras_auditoria'

// Ações padronizadas registradas no sistema
export const ACOES = {
  LOGIN: 'Login',
  LOGOUT: 'Logout',
  INCLUIU: 'Incluiu',
  ALTEROU: 'Alterou',
  EXCLUIU: 'Excluiu',
  CANCELOU: 'Cancelou',
  PAGOU: 'Marcou como pago',
  AJUSTE_ESTOQUE: 'Ajuste de estoque',
  INVENTARIO: 'Inventário realizado',
  EXPORTOU: 'Exportou relatório',
}

export function carregarLogs() {
  try {
    const bruto = localStorage.getItem(CHAVE_AUDITORIA)
    if (!bruto) return []
    const dado = JSON.parse(bruto)
    return Array.isArray(dado) ? dado : []
  } catch {
    return []
  }
}

// Registra uma operação relevante no log de auditoria.
// Os logs são imutáveis — só é possível acrescentar.
export function registrarLog(usuario, modulo, acao, detalhe = '') {
  try {
    const logs = carregarLogs()
    const d = new Date()
    const p = (n) => String(n).padStart(2, '0')
    const data = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    const hora = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    const id = logs.reduce((max, l) => Math.max(max, l.id || 0), 0) + 1

    const novo = {
      id,
      data,
      hora,
      usuario: usuario || 'sistema',
      modulo: modulo || '—',
      acao: acao || '—',
      detalhe: detalhe || '',
    }
    logs.unshift(novo) // mais recentes primeiro
    localStorage.setItem(CHAVE_AUDITORIA, JSON.stringify(logs))
    return novo
  } catch {
    return null
  }
}
