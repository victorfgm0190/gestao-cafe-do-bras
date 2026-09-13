// Camada de dados dos boletos (Fase 2 da V2). Todas as rotas exigem o módulo
// "Contas a Pagar" — o backend checa permissão e registra a auditoria sozinho,
// então as telas NÃO chamam registrarLog() para não duplicar o log.
import { getJson, sendJson } from './api'

// Regras puras (prévia de parcelas, normalização de data e de número) vivem em
// boletosCalculo.js, sem dependência de rede, e são reexportadas aqui para as
// telas importarem de um lugar só.
export { MAX_PARCELAS, dataISO, num, previaParcelas } from './boletosCalculo'

export const STATUS_BOLETO = ['SEM_VINCULO', 'VINCULADO', 'PAGO', 'CANCELADO']

export const ROTULO_STATUS = {
  SEM_VINCULO: 'Sem vínculo',
  VINCULADO: 'Vinculado',
  PAGO: 'Pago',
  CANCELADO: 'Cancelado',
}

export const ROTULO_STATUS_PARCELA = {
  PENDENTE: 'Pendente',
  PAGO: 'Pago',
  CANCELADO: 'Cancelado',
}

// Mapeia status de boleto, de parcela e de vínculo para as classes de badge.
export function classeBadge(status) {
  switch (status) {
    case 'ATIVO':
      return 'badge badge-ativo'
    case 'VINCULADO':
      return 'badge badge-vinculado'
    case 'PAGO':
      return 'badge badge-pago'
    case 'CANCELADO':
      return 'badge badge-cancelado'
    case 'PENDENTE':
      return 'badge badge-a-pagar'
    default:
      return 'badge badge-sem-vinculo'
  }
}

export function listarBoletos({ status, fornecedor, pagina = 1, limite = 10 } = {}) {
  const p = new URLSearchParams()
  if (status) p.set('status', status)
  if (fornecedor) p.set('fornecedor', fornecedor)
  p.set('pagina', String(pagina))
  p.set('limite', String(limite))
  return getJson(`/api/boletos?${p.toString()}`)
}

export const obterBoleto = (id) => getJson(`/api/boletos/${id}`)
export const criarBoleto = (dados) => sendJson('/api/boletos', 'POST', dados)
export const editarBoleto = (id, dados) => sendJson(`/api/boletos/${id}`, 'PUT', dados)
export const cancelarBoleto = (id) => sendJson(`/api/boletos/${id}`, 'DELETE')
export const boletosSemVinculo = () => getJson('/api/boletos/sem-vinculo')
