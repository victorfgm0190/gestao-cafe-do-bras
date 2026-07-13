// Inventário inteligente: conta física × saldo do sistema, aponta diferenças e regulariza.
//
// localStorage "inventarios": array de inventários
//   { id, data, tipo, status, criadoPor, concluidoEm, itens: [...] }

import { hojeISO } from './formato'
import { registrarMovimentacao, TIPOS_MOV } from './kardex'
import { atualizarSaldoLote } from './lotesCru'
import { registrarMovimentacaoTorrado, carregarEstoqueTorrado } from './torrado'
import {
  carregarCadastro as carregarInsumos,
  resumoPorInsumo,
  registrarMovimentacaoInsumo,
} from './insumos'
import { lotesCruDisponiveis, resumoPAEstoque, ajustarEstoquePA, formatarGramatura } from './pa'

const CHAVE = 'inventarios'

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

// ---------- Persistência ----------
export function carregarInventarios() {
  try {
    const bruto = localStorage.getItem(CHAVE)
    const dado = bruto ? JSON.parse(bruto) : []
    return Array.isArray(dado) ? dado : []
  } catch {
    return []
  }
}

function salvarInventarios(lista) {
  localStorage.setItem(CHAVE, JSON.stringify(lista))
}

export function carregarInventario(id) {
  return carregarInventarios().find((i) => i.id === Number(id)) || null
}

// Insere ou atualiza um inventário e devolve a lista.
export function salvarInventario(inv) {
  const lista = carregarInventarios()
  const idx = lista.findIndex((i) => i.id === inv.id)
  if (idx >= 0) lista[idx] = inv
  else lista.push(inv)
  salvarInventarios(lista)
  return inv
}

export function excluirInventario(id) {
  salvarInventarios(carregarInventarios().filter((i) => i.id !== Number(id)))
}

function proximoId() {
  return carregarInventarios().reduce((m, i) => Math.max(m, i.id || 0), 0) + 1
}

// ---------- Snapshot dos saldos do sistema ----------
function calcularItem(base) {
  const saldoSistema = Number(base.saldoSistema) || 0
  const saldoFisico = base.saldoFisico == null ? saldoSistema : Number(base.saldoFisico) || 0
  const diferenca = saldoFisico - saldoSistema
  const status = diferenca > 1e-9 ? 'sobra' : diferenca < -1e-9 ? 'falta' : 'ok'
  return { ...base, saldoSistema, saldoFisico, diferenca, status }
}

// Monta os itens a partir dos saldos atuais do sistema.
export async function gerarItensSistema() {
  const itens = []

  // Café cru (por lote)
  for (const l of await lotesCruDisponiveis()) {
    itens.push(
      calcularItem({
        categoria: CATEGORIAS.CRU,
        referencia: l.codigo || `#${l.id}`,
        descricao: `${l.produtor || '—'}${l.variedade ? ' / ' + l.variedade : ''}`,
        unidade: 'kg',
        saldoSistema: Number(l.saldoDisponivel) || 0,
        saldoFisico: null,
        regularizado: false,
        regularizacao: null,
        // identificadores para regularização
        loteId: l.id,
        loteCodigo: l.codigo || '',
        produtor: l.produtor || '',
        variedade: l.variedade || '',
      }),
    )
  }

  // Café torrado a granel
  const torr = carregarEstoqueTorrado()
  if ((Number(torr.saldoAtual) || 0) > 0) {
    itens.push(
      calcularItem({
        categoria: CATEGORIAS.TORRADO,
        referencia: 'Café torrado',
        descricao: 'Café torrado a granel',
        unidade: 'kg',
        saldoSistema: Number(torr.saldoAtual) || 0,
        saldoFisico: null,
        regularizado: false,
        regularizacao: null,
      }),
    )
  }

  // Produtos embalados (por produto + gramatura)
  for (const r of resumoPAEstoque()) {
    if ((Number(r.quantidade) || 0) <= 0) continue
    itens.push(
      calcularItem({
        categoria: CATEGORIAS.EMBALADO,
        referencia: `${r.paNome} ${formatarGramatura(r.gramatura)}`,
        descricao: `${r.paNome} — ${formatarGramatura(r.gramatura)}`,
        unidade: 'un',
        saldoSistema: Number(r.quantidade) || 0,
        saldoFisico: null,
        regularizado: false,
        regularizacao: null,
        paId: r.paId,
        gramatura: r.gramatura,
        paNome: r.paNome,
      }),
    )
  }

  // Insumos
  const insumos = carregarInsumos()
  const resumoIns = resumoPorInsumo()
  for (const i of insumos) {
    const saldo = Number(resumoIns[i.id]?.saldoAtual) || 0
    if (saldo <= 0) continue
    itens.push(
      calcularItem({
        categoria: CATEGORIAS.INSUMO,
        referencia: i.nome,
        descricao: i.nome,
        unidade: i.unidade || 'un',
        saldoSistema: saldo,
        saldoFisico: null,
        regularizado: false,
        regularizacao: null,
        insumoId: i.id,
      }),
    )
  }

  return itens
}

// Cria um novo inventário (rascunho, não persistido ainda).
export async function novoInventario(tipo, criadoPor) {
  return {
    id: proximoId(),
    data: hojeISO(),
    tipo: TIPOS_INVENTARIO.includes(tipo) ? tipo : 'Diário',
    status: 'Rascunho',
    criadoPor: criadoPor || 'sistema',
    concluidoEm: null,
    itens: await gerarItensSistema(),
  }
}

// Recalcula diferença/status de um item ao mudar a contagem física.
export function aplicarContagem(item, saldoFisico) {
  return calcularItem({ ...item, saldoFisico: saldoFisico === '' ? null : saldoFisico })
}

// ---------- Resumo ----------
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
  const comDiferenca = sobras + faltas
  return { ok, sobras, faltas, comDiferenca, pendentes, total: (inv.itens || []).length, tudoRegularizado: pendentes === 0 }
}

// ---------- Regularização ----------
async function ajustarLoteCru(loteId, saldoFisico) {
  const saldo = Math.max(0, Number(saldoFisico) || 0)
  await atualizarSaldoLote(loteId, saldo, saldo > 0 ? 'disponivel' : 'esgotado')
}

// Regulariza um item (índice) de um inventário e persiste o inventário.
// opcoes: { descricao?, quantidade? } (quantidade padrão = |diferença|)
export async function regularizarItem(invId, index, opcoes = {}) {
  const inv = carregarInventario(invId)
  if (!inv) return null
  const item = inv.itens[index]
  if (!item || item.status === 'ok' || item.regularizado) return inv

  const sobra = item.diferenca > 0
  const sentido = sobra ? 'positivo' : 'negativo'
  const quantidade = Math.abs(Number(opcoes.quantidade ?? item.diferenca)) || 0
  const dataRef = inv.data
  const descPadrao = sobra
    ? `Ajuste positivo - Inventário ${dataRef}`
    : item.categoria === CATEGORIAS.EMBALADO
      ? `Saída não identificada - Inventário ${dataRef}`
      : `Perda - Inventário ${dataRef}`
  const descricao = (opcoes.descricao || descPadrao).trim()

  let tipoReg = 'ajuste'
  if (!sobra) tipoReg = item.categoria === CATEGORIAS.EMBALADO ? 'saida_nao_identificada' : 'perda'

  // Aplica no kardex correspondente
  if (item.categoria === CATEGORIAS.CRU) {
    await ajustarLoteCru(item.loteId, item.saldoFisico)
    await registrarMovimentacao({
      tipo: TIPOS_MOV.AJUSTE,
      sentido,
      data: dataRef,
      descricao,
      produtor: item.produtor,
      variedade: item.variedade,
      quantidade,
    })
  } else if (item.categoria === CATEGORIAS.TORRADO) {
    registrarMovimentacaoTorrado({ tipo: TIPOS_MOV.AJUSTE, sentido, data: dataRef, descricao, quantidade })
  } else if (item.categoria === CATEGORIAS.INSUMO) {
    registrarMovimentacaoInsumo({
      insumoId: item.insumoId,
      tipo: TIPOS_MOV.AJUSTE,
      sentido,
      data: dataRef,
      descricao,
      quantidade,
    })
  } else if (item.categoria === CATEGORIAS.EMBALADO) {
    ajustarEstoquePA({
      paId: item.paId,
      gramatura: item.gramatura,
      quantidade: sobra ? quantidade : -quantidade,
      descricao,
      data: dataRef,
    })
  }

  item.regularizado = true
  item.regularizacao = { tipo: tipoReg, descricao, quantidade }
  inv.itens[index] = item
  return salvarInventario(inv)
}

// Conclui o inventário (exige tudo regularizado).
export function concluirInventario(invId, quando) {
  const inv = carregarInventario(invId)
  if (!inv) return null
  const r = resumoInventario(inv)
  if (!r.tudoRegularizado) return inv
  inv.status = 'Concluído'
  inv.concluidoEm = quando || hojeISO()
  return salvarInventario(inv)
}
