// Inventário inteligente — cliente async da API (api/inventario). A geração de
// itens e a regularização (que ajusta os kardex de todos os módulos) são no backend.

import { getJson, sendJson } from './api'

export const TIPOS_INVENTARIO = ['Diário', 'Semanal', 'Mensal']

export const CATEGORIAS = {
  CRU: 'cafe_cru',
  TORRADO: 'cafe_torrado',
  EMBALADO: 'produto_embalado',
  INSUMO: 'insumo',
}

export const ROTULO_CATEGORIA = {
  cafe_cru: 'Café cru',
  cafe_torrado: 'Café torrado',
  produto_embalado: 'Produto embalado',
  insumo: 'Insumo',
}

const mapInv = (r) =>
  r && {
    id: r.id,
    data: typeof r.data === 'string' ? r.data.slice(0, 10) : r.data,
    tipo: r.tipo,
    status: r.status,
    criadoPor: r.criado_por || 'sistema',
    concluidoEm: typeof r.concluido_em === 'string' ? r.concluido_em.slice(0, 10) : r.concluido_em,
    itens: Array.isArray(r.itens) ? r.itens : [],
  }

// ---------- Persistência ----------
export async function carregarInventarios() {
  const d = await getJson('/api/inventario')
  return (d.inventarios || []).map(mapInv)
}
export async function carregarInventario(id) {
  const d = await getJson(`/api/inventario/${id}`)
  return mapInv(d.inventario)
}
// Cria um inventário (Rascunho já persistido, com itens gerados do sistema).
export async function novoInventario(tipo, criadoPor) {
  const d = await sendJson('/api/inventario', 'POST', { tipo, criadoPor })
  return mapInv(d.inventario)
}
export async function salvarInventario(inv) {
  const d = await sendJson(`/api/inventario/${inv.id}`, 'PUT', {
    itens: inv.itens,
    status: inv.status,
    concluidoEm: inv.concluidoEm,
  })
  return mapInv(d.inventario)
}
export async function excluirInventario(id) {
  await sendJson(`/api/inventario/${id}`, 'DELETE')
}

// Regulariza um item (backend aplica o ajuste no módulo e marca o item).
// itens = estado atual dos itens (com as contagens físicas) do formulário.
export async function regularizarItem(invId, index, opcoes = {}, itens) {
  const d = await sendJson(`/api/inventario/${invId}/regularizar`, 'POST', {
    index,
    itens,
    descricao: opcoes.descricao,
    quantidade: opcoes.quantidade,
  })
  return mapInv(d.inventario)
}
// Conclui o inventário (exige tudo regularizado). Devolve { inventario, concluido }.
export async function concluirInventario(invId, itens, quando) {
  const d = await sendJson(`/api/inventario/${invId}/concluir`, 'POST', { itens, quando })
  return { inventario: mapInv(d.inventario), concluido: d.concluido }
}

// ---------- Puros (sem API) ----------
export function calcularItem(base) {
  const saldoSistema = Number(base.saldoSistema) || 0
  const saldoFisico = base.saldoFisico == null ? saldoSistema : Number(base.saldoFisico) || 0
  const diferenca = saldoFisico - saldoSistema
  const status = diferenca > 1e-9 ? 'sobra' : diferenca < -1e-9 ? 'falta' : 'ok'
  return { ...base, saldoSistema, saldoFisico, diferenca, status }
}

export function aplicarContagem(item, saldoFisico) {
  return calcularItem({ ...item, saldoFisico: saldoFisico === '' ? null : saldoFisico })
}

export function resumoInventario(inv) {
  let ok = 0
  let sobras = 0
  let faltas = 0
  let pendentes = 0
  for (const it of inv.itens || []) {
    if (it.status === 'ok') ok++
    else {
      if (it.status === 'sobra') sobras++
      if (it.status === 'falta') faltas++
      if (!it.regularizado) pendentes++
    }
  }
  return {
    ok,
    sobras,
    faltas,
    comDiferenca: sobras + faltas,
    pendentes,
    total: (inv.itens || []).length,
    tudoRegularizado: pendentes === 0,
  }
}
