// Café torrado (PP) — cliente async da API (api/torrado). Substitui o localStorage.
// A torra baixa café cru e gera torrado; toda a orquestração é no backend.

import { getJson, sendJson } from './api'
import { loteCruPorId, lotesCruDisponiveis } from './lotesCru'

// Re-exporta para as telas que importam de torrado.js (TorradoEntrada).
export { lotesCruDisponiveis, loteCruPorId }

export const PERFIS_TORRA = ['Clara', 'Média', 'Escura']

const num = (v) => Number(v) || 0
const mapMov = (r) =>
  r && {
    id: r.id,
    data: typeof r.data === 'string' ? r.data.slice(0, 10) : r.data,
    tipo: r.tipo,
    descricao: r.descricao || '',
    quantidade: num(r.quantidade),
    custoUnitario: num(r.custo_unitario),
    custoTotal: num(r.custo_total),
    saldoAcumulado: num(r.saldo_acumulado),
    custoMedio: num(r.custo_medio),
  }
const mapTorra = (r) =>
  r && {
    id: r.id,
    data: typeof r.data === 'string' ? r.data.slice(0, 10) : r.data,
    loteId: r.lote_id,
    loteCodigo: r.lote_codigo || '',
    produtor: r.produtor || '',
    pesoCru: num(r.peso_cru),
    pesoTorrado: num(r.peso_torrado),
    perda: num(r.perda),
    rendimento: num(r.rendimento),
    perfil: r.perfil || '',
    observacao: r.observacao || '',
    custoPorKgLote: num(r.custo_por_kg_lote),
    custoTorradoUnit: num(r.custo_torrado_unit),
    movCruId: r.mov_cru_id ?? null,
    movTorradoId: r.mov_torrado_id ?? null,
  }

// ---------- Kardex / resumo do torrado ----------
export async function carregarKardexTorrado() {
  const d = await getJson('/api/torrado/kardex')
  return (d.movimentacoes || []).map(mapMov)
}
export async function carregarEstoqueTorrado() {
  return getJson('/api/torrado/resumo') // { saldoAtual, custoMedio, ultimaAtualizacao }
}
export async function registrarMovimentacaoTorrado(input) {
  const d = await sendJson('/api/torrado/movimentacao', 'POST', input)
  return mapMov(d.movimentacao)
}
export async function removerMovimentacaoTorrado(id) {
  await sendJson(`/api/torrado/movimentacao/${id}`, 'DELETE')
}

// ---------- Histórico de torras ----------
export async function carregarTorras() {
  const d = await getJson('/api/torrado/torras')
  return (d.torras || []).map(mapTorra)
}
// Registra uma torra (backend baixa o cru, gera o torrado e grava o histórico).
// input: { data, loteId, pesoCru, pesoTorrado, perfil, observacao }
export async function registrarTorra(input) {
  const d = await sendJson('/api/torrado/torras', 'POST', input)
  return mapTorra(d.torra)
}
export async function estornarTorra(torraId) {
  await sendJson(`/api/torrado/torras/${torraId}`, 'DELETE')
}
