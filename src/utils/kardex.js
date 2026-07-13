// Kardex do café cru — agora consumido da API REST (PostgreSQL) via api/cafe-cru.
//
// As funções mantêm os MESMOS NOMES da versão localStorage, mas passaram a ser
// ASSÍNCRONAS (retornam Promise). A regra de custeio — custo médio ponderado
// ISOLADO por grupo (fazenda + variedade), saldo acumulado corrido e código de
// lote automático — vive no backend.

import { getJson, sendJson } from './api'

export const TIPOS_MOV = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  AJUSTE: 'Ajuste',
  PERDA: 'Perda',
}

export const LISTA_TIPOS = [
  TIPOS_MOV.ENTRADA,
  TIPOS_MOV.SAIDA,
  TIPOS_MOV.AJUSTE,
  TIPOS_MOV.PERDA,
]

// Chave do grupo de custeio: fazenda (produtor) + variedade.
export function chaveGrupo(produtor, variedade) {
  return `${(produtor || '').trim()}|${(variedade || '').trim()}`
}

// ---------- helpers ----------
const n = (v) => Number(v) || 0

// snake_case (API) → camelCase (esperado pelo app)
function mapMov(r) {
  if (!r) return null
  return {
    id: r.id,
    data: typeof r.data === 'string' ? r.data.slice(0, 10) : r.data,
    tipo: r.tipo,
    descricao: r.descricao || '',
    produtor: r.produtor || '',
    variedade: r.variedade || '',
    grupo: r.grupo || '',
    quantidade: n(r.quantidade),
    custoUnitario: n(r.custo_unitario),
    custoTotal: n(r.custo_total),
    saldoAcumulado: n(r.saldo_acumulado),
    custoMedio: n(r.custo_medio),
    loteId: r.lote_id ?? null,
  }
}

// ---------- API pública (mesmos nomes; agora async) ----------

// A semeadura inicial passou a acontecer no backend (criar lote cria a ENTRADA).
// Mantida como no-op assíncrono para não quebrar chamadas existentes.
export async function garantirKardexInicial() {}

// Lista todas as movimentações do kardex do café cru (ordenadas por data, id).
export async function carregarKardex() {
  const data = await getJson('/api/cafe-cru/kardex')
  return (data.movimentacoes || []).map(mapMov)
}

// Resumo TOTAL do estoque (saldo e custo médio geral) — usado no dashboard/kardex.
export async function carregarEstoqueResumo() {
  const data = await getJson('/api/cafe-cru/resumo')
  return { ...data.total, ultimaAtualizacao: null }
}

// Resumo por grupo (fazenda + variedade), já filtrado e ordenado.
export async function carregarEstoqueResumoPorGrupo() {
  const data = await getJson('/api/cafe-cru/resumo')
  return data.grupos || []
}

// Custo médio ponderado ATUAL de um grupo (fazenda + variedade).
export async function custoMedioGrupo(produtor, variedade) {
  const chave = chaveGrupo(produtor, variedade)
  const data = await getJson('/api/cafe-cru/resumo')
  const g = (data.grupos || []).find((x) => x.chave === chave)
  return Number(g?.custoMedio) || 0
}

// Registra uma movimentação (entrada avulsa/saída/perda/ajuste) e reprocessa o grupo.
// input: { tipo, descricao, quantidade, custoUnitario, data, sentido, produtor, variedade, loteId }
export async function registrarMovimentacao(input) {
  const data = await sendJson('/api/cafe-cru/movimentacao', 'POST', {
    tipo: input.tipo,
    descricao: input.descricao || '',
    quantidade: input.quantidade,
    custoUnitario: input.custoUnitario,
    data: input.data,
    sentido: input.sentido,
    produtor: input.produtor,
    variedade: input.variedade,
    lote_id: input.loteId ?? input.lote_id ?? null,
  })
  return mapMov(data.movimentacao)
}

// Remove uma movimentação pelo id e reprocessa o grupo.
export async function removerMovimentacao(id) {
  await sendJson(`/api/cafe-cru/movimentacao/${id}`, 'DELETE')
}

// Edita uma ENTRADA e dispara o recálculo em cascata do grupo.
// Retorna o relatório de impacto do kardex:
//   { custoMedioAntes, custoMedioDepois, movimentacoesAfetadas, resumo, entrada }
export async function editarEntrada(id, campos = {}) {
  return sendJson(`/api/cafe-cru/movimentacao/${id}`, 'PUT', {
    quantidade: campos.quantidade,
    custoUnitario: campos.custoUnitario,
    data: campos.data,
    descricao: campos.descricao,
    produtor: campos.produtor,
    variedade: campos.variedade,
  })
}

// Localiza a movimentação de ENTRADA correspondente a um lote (código no início da descrição).
export async function acharEntradaPorCodigo(codigo) {
  if (!codigo) return null
  const alvo = String(codigo)
  const movs = await carregarKardex()
  return (
    movs.find(
      (m) => m.tipo === TIPOS_MOV.ENTRADA && String(m.descricao || '').startsWith(alvo),
    ) || null
  )
}
