// Estoque de insumos: cadastro + entradas + kardex com custo médio ponderado por insumo.
//
// localStorage:
//   insumos_cadastro → [{ id, nome, unidade, estoqueMinimo, descricao }]
//   insumos_entradas → [{ id, insumoId, data, quantidade, custoUnitario, fornecedor, observacao }]
//   kardex_insumos   → [{ id, insumoId, data, tipo, descricao, quantidade, custoUnitario,
//                         custoTotal, saldoAcumulado, custoMedio }]
//
// O custo médio é recalculado por insumo a cada entrada (mesma fórmula do café cru):
//   custoMedio = (saldoAnt * custoMedioAnt + qtdEntrada * custoEntrada) / novoSaldo

import { hojeISO } from './formato'
import { TIPOS_MOV } from './kardex'

export const CHAVE_CADASTRO = 'insumos_cadastro'
export const CHAVE_ENTRADAS = 'insumos_entradas'
export const CHAVE_KARDEX = 'kardex_insumos'

export const UNIDADES = ['un', 'cx', 'rolo', 'kg']

const CADASTRO_INICIAL = [
  { id: 1, nome: 'Embalagem 250g', unidade: 'un', estoqueMinimo: 100, descricao: 'Embalagem stand-up pouch de 250g.' },
  { id: 2, nome: 'Embalagem 1kg', unidade: 'un', estoqueMinimo: 50, descricao: 'Embalagem stand-up pouch de 1kg.' },
  { id: 3, nome: 'Válvula unidirecional', unidade: 'un', estoqueMinimo: 200, descricao: 'Válvula desgaseificadora.' },
  { id: 4, nome: 'Etiqueta', unidade: 'un', estoqueMinimo: 300, descricao: 'Etiqueta adesiva de identificação.' },
  { id: 5, nome: 'Caixa de transporte', unidade: 'cx', estoqueMinimo: 20, descricao: 'Caixa de papelão para envio.' },
  { id: 6, nome: 'Drip filter', unidade: 'un', estoqueMinimo: 100, descricao: 'Sachê drip coffee individual.' },
]

// Formata quantidade com a unidade do insumo (ex.: "120 un", "12,5 kg").
export function formatarQuantidade(valor, unidade) {
  const n = (Number(valor) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  return `${n} ${unidade || ''}`.trim()
}

// ---------- Cadastro ----------
export function carregarCadastro() {
  try {
    const bruto = localStorage.getItem(CHAVE_CADASTRO)
    if (!bruto) {
      localStorage.setItem(CHAVE_CADASTRO, JSON.stringify(CADASTRO_INICIAL))
      return CADASTRO_INICIAL
    }
    const dado = JSON.parse(bruto)
    return Array.isArray(dado) ? dado : CADASTRO_INICIAL
  } catch {
    return CADASTRO_INICIAL
  }
}

export function salvarCadastro(lista) {
  localStorage.setItem(CHAVE_CADASTRO, JSON.stringify(lista))
}

export function proximoIdCadastro(lista) {
  return lista.reduce((max, i) => Math.max(max, i.id || 0), 0) + 1
}

export function insumoPorId(id) {
  return carregarCadastro().find((i) => i.id === Number(id)) || null
}

// ---------- Entradas ----------
export function carregarEntradas() {
  try {
    const bruto = localStorage.getItem(CHAVE_ENTRADAS)
    const dado = bruto ? JSON.parse(bruto) : []
    return Array.isArray(dado) ? dado : []
  } catch {
    return []
  }
}

function salvarEntradas(lista) {
  localStorage.setItem(CHAVE_ENTRADAS, JSON.stringify(lista))
}

// ---------- Kardex ----------
export function carregarKardex() {
  try {
    const bruto = localStorage.getItem(CHAVE_KARDEX)
    const dado = bruto ? JSON.parse(bruto) : []
    return Array.isArray(dado) ? dado : []
  } catch {
    return []
  }
}

function salvarKardex(lista) {
  localStorage.setItem(CHAVE_KARDEX, JSON.stringify(lista))
}

function ordenar(a, b) {
  return (a.data || '').localeCompare(b.data || '') || (a.id || 0) - (b.id || 0)
}

// Reprocessa o kardex agrupando por insumo. Muta os registros (saldoAcumulado,
// custoMedio, custoTotal, custoUnitario derivado) e devolve um mapa insumoId → resumo.
function recalcularKardex(movs) {
  const grupos = {}
  for (const m of movs) {
    const k = m.insumoId
    ;(grupos[k] = grupos[k] || []).push(m)
  }
  const resumo = {}
  for (const k of Object.keys(grupos)) {
    let saldo = 0
    let custoMedio = 0
    for (const m of grupos[k].sort(ordenar)) {
      const q = Number(m.quantidade) || 0
      const custoEntrada = Number(m.custoUnitario) || 0
      if (q > 0 && custoEntrada > 0) {
        const novoSaldo = saldo + q
        custoMedio = novoSaldo > 0 ? (saldo * custoMedio + q * custoEntrada) / novoSaldo : 0
        saldo = novoSaldo
        m.custoUnitario = custoEntrada
      } else {
        saldo = saldo + q
        m.custoUnitario = custoMedio
      }
      m.saldoAcumulado = saldo
      m.custoMedio = custoMedio
      m.custoTotal = Math.abs(q) * m.custoUnitario
    }
    resumo[k] = { saldoAtual: saldo, custoMedio }
  }
  return resumo
}

// Resumo (saldo + custo médio) de cada insumo, derivado do kardex.
export function resumoPorInsumo() {
  return recalcularKardex(carregarKardex())
}

// Registra uma movimentação e reprocessa o kardex.
// input: { insumoId, tipo, descricao, quantidade (positiva), custoUnitario, data, sentido }
export function registrarMovimentacaoInsumo(input) {
  const movs = carregarKardex()
  const proximoId = movs.reduce((max, m) => Math.max(max, m.id || 0), 0) + 1

  const q = Math.abs(Number(String(input.quantidade).replace(',', '.'))) || 0
  let delta = q
  if (input.tipo === TIPOS_MOV.SAIDA || input.tipo === TIPOS_MOV.PERDA) {
    delta = -q
  } else if (input.tipo === TIPOS_MOV.AJUSTE) {
    delta = input.sentido === 'positivo' ? q : -q
  }
  const custoUnitario =
    delta > 0 ? Number(String(input.custoUnitario).replace(',', '.')) || 0 : 0

  const registro = {
    id: proximoId,
    insumoId: Number(input.insumoId),
    data: input.data || hojeISO(),
    tipo: input.tipo,
    descricao: input.descricao || '',
    quantidade: delta,
    custoUnitario,
    custoTotal: 0,
    saldoAcumulado: 0,
    custoMedio: 0,
  }

  const todos = [...movs, registro]
  recalcularKardex(todos)
  salvarKardex(todos)
  return registro
}

// Registra uma ENTRADA de insumo: grava em insumos_entradas e lança no kardex.
// input: { insumoId, data, quantidade, custoUnitario, fornecedor, observacao }
export function registrarEntradaInsumo(input) {
  const entradas = carregarEntradas()
  const proximoId = entradas.reduce((max, e) => Math.max(max, e.id || 0), 0) + 1
  const entrada = {
    id: proximoId,
    insumoId: Number(input.insumoId),
    data: input.data || hojeISO(),
    quantidade: Number(String(input.quantidade).replace(',', '.')) || 0,
    custoUnitario: Number(String(input.custoUnitario).replace(',', '.')) || 0,
    fornecedor: (input.fornecedor || '').trim(),
    observacao: (input.observacao || '').trim(),
  }
  salvarEntradas([...entradas, entrada])

  const descricao =
    (entrada.fornecedor ? `Entrada — ${entrada.fornecedor}` : 'Entrada') +
    (entrada.observacao ? ` (${entrada.observacao})` : '')

  registrarMovimentacaoInsumo({
    insumoId: entrada.insumoId,
    tipo: TIPOS_MOV.ENTRADA,
    data: entrada.data,
    descricao,
    quantidade: entrada.quantidade,
    custoUnitario: entrada.custoUnitario,
  })

  return entrada
}
