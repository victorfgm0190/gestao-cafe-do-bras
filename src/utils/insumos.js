// Insumos — cliente async da API (api/insumos). Substitui o localStorage.
// O custo médio ponderado por insumo é calculado no backend.

import { getJson, sendJson } from './api'

export const UNIDADES = ['un', 'cx', 'rolo', 'kg']

export function formatarQuantidade(valor, unidade) {
  const n = (Number(valor) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  return `${n} ${unidade || ''}`.trim()
}

const num = (v) => Number(v) || 0
const mapInsumo = (r) =>
  r && {
    id: r.id,
    nome: r.nome || '',
    unidade: r.unidade || 'un',
    estoqueMinimo: num(r.estoque_minimo),
    descricao: r.descricao || '',
  }
const mapMov = (r) =>
  r && {
    id: r.id,
    insumoId: r.insumo_id,
    data: typeof r.data === 'string' ? r.data.slice(0, 10) : r.data,
    tipo: r.tipo,
    descricao: r.descricao || '',
    quantidade: num(r.quantidade),
    custoUnitario: num(r.custo_unitario),
    custoTotal: num(r.custo_total),
    saldoAcumulado: num(r.saldo_acumulado),
    custoMedio: num(r.custo_medio),
  }

// ---------- Cadastro ----------
export async function carregarCadastro() {
  const d = await getJson('/api/insumos/cadastro')
  return (d.insumos || []).map(mapInsumo)
}
export async function criarInsumo(dados) {
  const d = await sendJson('/api/insumos/cadastro', 'POST', dados)
  return mapInsumo(d.insumo)
}
export async function editarInsumo(id, dados) {
  const d = await sendJson(`/api/insumos/cadastro/${id}`, 'PUT', dados)
  return mapInsumo(d.insumo)
}
export async function excluirInsumo(id) {
  await sendJson(`/api/insumos/cadastro/${id}`, 'DELETE')
}
export async function insumoPorId(id) {
  const lista = await carregarCadastro()
  return lista.find((i) => i.id === Number(id)) || null
}

// ---------- Entradas ----------
export async function carregarEntradas() {
  const d = await getJson('/api/insumos/entradas')
  return (d.entradas || []).map((e) => ({
    id: e.id,
    insumoId: e.insumo_id,
    data: typeof e.data === 'string' ? e.data.slice(0, 10) : e.data,
    quantidade: num(e.quantidade),
    custoUnitario: num(e.custo_unitario),
    fornecedor: e.fornecedor || '',
    observacao: e.observacao || '',
  }))
}
export async function registrarEntradaInsumo(input) {
  const d = await sendJson('/api/insumos/entradas', 'POST', input)
  return d.entrada
}

// ---------- Kardex ----------
export async function carregarKardex() {
  const d = await getJson('/api/insumos/kardex')
  return (d.movimentacoes || []).map(mapMov)
}
export async function resumoPorInsumo() {
  const d = await getJson('/api/insumos/resumo')
  return d.resumo || {}
}
export async function registrarMovimentacaoInsumo(input) {
  const d = await sendJson('/api/insumos/movimentacao', 'POST', input)
  return mapMov(d.movimentacao)
}
export async function removerMovimentacaoInsumo(id) {
  await sendJson(`/api/insumos/movimentacao/${id}`, 'DELETE')
}
