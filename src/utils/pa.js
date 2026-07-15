// Produtos Acabados (PA) + Ordem de Produção — cliente async da API (api/pa).
// Toda a orquestração da ordem (baixa café cru + insumos, sobra no torrado,
// estoque de PA) e o recálculo em cascata acontecem no backend.

import { getJson, sendJson } from './api'
import { chaveGrupo } from './kardex'
import { loteCruPorId, lotesCruDisponiveis } from './lotesCru'

// Re-exporta para as telas que importam de pa.js (OrdemProducao, Dashboard).
export { lotesCruDisponiveis, loteCruPorId }

export const GRAMATURAS = [200, 250, 1000, 'drip']

export function formatarGramatura(g) {
  if (g === 'drip') return 'Drip (10g)'
  // Já vem formatada do banco ("250g", "1kg", "Drip (10g)") → devolve como está.
  if (typeof g === 'string' && /[a-z]/i.test(g)) return g
  const n = Number(g) || 0
  return n === 1000 ? '1kg' : `${n}g`
}

// Peso em gramas de uma gramatura. Aceita número (250), identificador ('drip')
// e rótulo já formatado ("250g", "1kg", "Drip (10g)"). Use SEMPRE que a gramatura
// for usada como número (peso/custo/ordenação).
export function pesoGramas(g) {
  if (typeof g === 'number') return g
  const s = String(g).toLowerCase().trim()
  if (s.includes('drip')) return 10
  if (s.endsWith('kg')) return (parseFloat(s) || 0) * 1000
  return parseFloat(s) || 0
}

const num = (v) => Number(v) || 0
const mapPA = (r) =>
  r && {
    id: r.id,
    nome: r.nome || '',
    gramaturas: Array.isArray(r.gramaturas) ? r.gramaturas.map((g) => (g === 'drip' ? 'drip' : Number(g))) : [],
    embalagem200Id: r.embalagem_200_id ?? null,
    embalagem250Id: r.embalagem_250_id ?? null,
    embalagem1000Id: r.embalagem_1000_id ?? null,
    embalagemDripId: r.embalagem_drip_id ?? null,
    ativo: r.ativo,
    perdaTorraPadrao: r.perda_torra_padrao != null ? num(r.perda_torra_padrao) : 10,
  }
const mapOrdem = (o) =>
  o && {
    id: o.id,
    data: typeof o.data === 'string' ? o.data.slice(0, 10) : o.data,
    paId: o.pa_id,
    paNome: o.pa_nome || '',
    totalCru: num(o.total_cru),
    custoTotalCru: num(o.custo_total_cru),
    totalKgEmbalado: num(o.total_kg_embalado),
    custoKgEmbalado: num(o.custo_kg_embalado),
    sobra: num(o.sobra),
    perda: num(o.perda),
    custoTotalCafe: num(o.custo_total_cafe),
    custoTotalEmbalagens: num(o.custo_total_embalagens),
    custoTotal: num(o.custo_total),
    movTorradoId: o.mov_torrado_id ?? null,
    lotes: Array.isArray(o.lotes) ? o.lotes : [],
    itens: Array.isArray(o.itens) ? o.itens : [],
  }

// Embalagem vinculada a uma gramatura do PA (objeto já mapeado em camelCase).
export function embalagemDoPA(pa, gramatura) {
  if (gramatura === 'drip') return pa?.embalagemDripId ?? null
  if (Number(gramatura) === 200) return pa?.embalagem200Id ?? null
  if (Number(gramatura) === 250) return pa?.embalagem250Id ?? null
  if (Number(gramatura) === 1000) return pa?.embalagem1000Id ?? null
  return null
}

// ---------- Cadastro de PA ----------
export async function carregarPA() {
  const d = await getJson('/api/pa/cadastro')
  return (d.produtos || []).map(mapPA)
}
export async function criarPA(dados) {
  const d = await sendJson('/api/pa/cadastro', 'POST', dados)
  return mapPA(d.produto)
}
export async function editarPA(id, dados) {
  const d = await sendJson(`/api/pa/cadastro/${id}`, 'PUT', dados)
  return mapPA(d.produto)
}
export async function excluirPA(id) {
  await sendJson(`/api/pa/cadastro/${id}`, 'DELETE')
}
export async function embalagensPadrao() {
  const d = await getJson('/api/insumos/cadastro')
  const insumos = d.insumos || []
  return {
    embalagem250Id: insumos.find((i) => i.nome === 'Embalagem 250g')?.id ?? null,
    embalagem1000Id: insumos.find((i) => i.nome === 'Embalagem 1kg')?.id ?? null,
  }
}

// ---------- Estoque / movimentações / ordens ----------
export async function resumoPAEstoque() {
  const d = await getJson('/api/pa/estoque')
  return d.estoque || []
}
export async function carregarOrdens() {
  const d = await getJson('/api/pa/ordens')
  return (d.ordens || []).map(mapOrdem)
}
// Prévia dos custos de uma ordem (não persiste).
export async function calcularOrdem(input) {
  const d = await sendJson('/api/pa/ordens/calcular', 'POST', input)
  return d.calc
}
export async function registrarOrdem(input) {
  const d = await sendJson('/api/pa/ordens', 'POST', input)
  return mapOrdem(d.ordem)
}
export async function estornarOrdem(ordemId) {
  await sendJson(`/api/pa/ordens/${ordemId}`, 'DELETE')
}
// Recalcula os custos de uma ordem após o recálculo em cascata do café cru.
export async function recalcularOrdemProducao(ordemId) {
  return sendJson(`/api/pa/ordens/${ordemId}/recalcular`, 'POST')
}
// Ordens que consumiram café de um grupo (fazenda + variedade).
export async function ordensDoGrupo(produtor, variedade) {
  const chave = chaveGrupo(produtor, variedade)
  const ordens = await carregarOrdens()
  return ordens.filter((o) => (o.lotes || []).some((l) => chaveGrupo(l.produtor, l.variedade) === chave))
}
// Ajuste avulso de estoque de PA (usado pelo inventário).
export async function ajustarEstoquePA(input) {
  const d = await sendJson('/api/pa/ajuste', 'POST', input)
  return d.registro
}
