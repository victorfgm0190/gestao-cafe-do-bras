// Kardex do café cru com custo médio ponderado.
//
// Estruturas no localStorage:
//   kardex_cafe_cru  → array de movimentações
//     { id, data, tipo, descricao, quantidade, custoUnitario, custoTotal, saldoAcumulado, custoMedio }
//     obs.: `quantidade` é o efeito no saldo (positivo = entra, negativo = sai).
//   estoque_cafe_cru → { saldoAtual, custoMedio, ultimaAtualizacao }
//
// O custo médio é recalculado a cada ENTRADA:
//   custoMedio = (saldoAnt * custoMedioAnt + qtdEntrada * custoEntrada) / novoSaldo

import { hojeISO } from './formato'

export const CHAVE_KARDEX = 'kardex_cafe_cru'
export const CHAVE_ESTOQUE = 'estoque_cafe_cru'
const CHAVE_LOTES = 'cafe_do_bras_estoque' // fonte para a semeadura inicial

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

function agoraTexto() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// ---------- Persistência ----------
export function carregarKardex() {
  try {
    const bruto = localStorage.getItem(CHAVE_KARDEX)
    const dado = bruto ? JSON.parse(bruto) : []
    return Array.isArray(dado) ? dado : []
  } catch {
    return []
  }
}

export function salvarKardex(lista) {
  localStorage.setItem(CHAVE_KARDEX, JSON.stringify(lista))
}

export function salvarEstoqueResumo(resumo) {
  localStorage.setItem(CHAVE_ESTOQUE, JSON.stringify(resumo))
}

function carregarLotes() {
  try {
    const bruto = localStorage.getItem(CHAVE_LOTES)
    const dado = bruto ? JSON.parse(bruto) : []
    return Array.isArray(dado) ? dado : []
  } catch {
    return []
  }
}

// ---------- Núcleo do cálculo ----------
// Ordena por data (asc) e, no empate, por id (asc) — garante o saldo corrido correto.
function ordenar(a, b) {
  return (a.data || '').localeCompare(b.data || '') || (a.id || 0) - (b.id || 0)
}

// Percorre as movimentações em ordem cronológica, preenchendo custoUnitario,
// custoTotal, saldoAcumulado e custoMedio. Muta os registros e devolve os totais.
function recalcular(movs) {
  let saldo = 0
  let custoMedio = 0
  for (const m of movs) {
    const q = Number(m.quantidade) || 0
    const custoEntrada = Number(m.custoUnitario) || 0
    // Entrada de estoque com custo → recalcula o custo médio ponderado.
    if (q > 0 && custoEntrada > 0) {
      const novoSaldo = saldo + q
      custoMedio = novoSaldo > 0 ? (saldo * custoMedio + q * custoEntrada) / novoSaldo : 0
      saldo = novoSaldo
      m.custoUnitario = custoEntrada
    } else {
      // Saída, perda ou ajuste: o saldo diminui e o custo médio vigente não muda.
      saldo = saldo + q
      // Se a saída trouxe um custo explícito (ex.: baixa de um lote específico na
      // torra), preserva-o; caso contrário, valoriza pelo custo médio vigente.
      if (!(m.custoManual && Number(m.custoUnitario) > 0)) {
        m.custoUnitario = custoMedio
      }
    }
    m.saldoAcumulado = saldo
    m.custoMedio = custoMedio
    m.custoTotal = Math.abs(q) * m.custoUnitario
  }
  return { saldoAtual: saldo, custoMedio }
}

// Semeia o kardex a partir dos lotes de café cru já cadastrados (uma única vez).
// Só grava quando há lotes — se ainda não houver, tenta de novo numa próxima chamada.
export function garantirKardexInicial() {
  if (localStorage.getItem(CHAVE_KARDEX) !== null) return
  const lotes = carregarLotes()
  if (!lotes.length) return

  const movs = [...lotes]
    .sort((a, b) => (a.recebimento || '').localeCompare(b.recebimento || '') || a.id - b.id)
    .map((l, i) => ({
      id: i + 1,
      data: l.recebimento,
      tipo: TIPOS_MOV.ENTRADA,
      descricao: `${l.codigo || 'Lote'} — ${l.produtor || ''}`.trim(),
      quantidade: Number(l.pesoTotal) || 0,
      custoUnitario: Number(l.custoPorKg) || 0,
      custoTotal: 0,
      saldoAcumulado: 0,
      custoMedio: 0,
    }))

  const { saldoAtual, custoMedio } = recalcular(movs)
  salvarKardex(movs)
  salvarEstoqueResumo({ saldoAtual, custoMedio, ultimaAtualizacao: agoraTexto() })
}

// Resumo atual do estoque (saldo e custo médio). Deriva do kardex se necessário.
export function carregarEstoqueResumo() {
  try {
    const bruto = localStorage.getItem(CHAVE_ESTOQUE)
    if (bruto) return JSON.parse(bruto)
  } catch {
    /* ignora e deriva abaixo */
  }
  const { saldoAtual, custoMedio } = recalcular(carregarKardex())
  return { saldoAtual, custoMedio, ultimaAtualizacao: null }
}

// Registra uma movimentação e reprocessa o kardex + o resumo.
// input: { tipo, descricao, quantidade (magnitude positiva), custoUnitario, data, sentido }
//   - sentido só é usado no Ajuste: 'positivo' | 'negativo' (padrão negativo)
export function registrarMovimentacao(input) {
  garantirKardexInicial()
  const movs = carregarKardex()
  const proximoId = movs.reduce((max, m) => Math.max(max, m.id || 0), 0) + 1

  const q = Math.abs(Number(String(input.quantidade).replace(',', '.'))) || 0
  let delta = q // ENTRADA
  if (input.tipo === TIPOS_MOV.SAIDA || input.tipo === TIPOS_MOV.PERDA) {
    delta = -q
  } else if (input.tipo === TIPOS_MOV.AJUSTE) {
    delta = input.sentido === 'positivo' ? q : -q
  }
  // Para entradas o custo é o de compra; para saídas normalmente é derivado do custo
  // médio, mas aceitamos um custo explícito (ex.: baixa de um lote específico na torra).
  const custoInformado = Number(String(input.custoUnitario).replace(',', '.')) || 0
  const custoManual = delta <= 0 && custoInformado > 0

  const registro = {
    id: proximoId,
    data: input.data || hojeISO(),
    tipo: input.tipo,
    descricao: input.descricao || '',
    quantidade: delta,
    custoUnitario: custoInformado,
    custoManual,
    custoTotal: 0,
    saldoAcumulado: 0,
    custoMedio: 0,
  }

  const todos = [...movs, registro].sort(ordenar)
  const { saldoAtual, custoMedio } = recalcular(todos)
  salvarKardex(todos)
  salvarEstoqueResumo({ saldoAtual, custoMedio, ultimaAtualizacao: agoraTexto() })
  return registro
}

// Remove uma movimentação pelo id e reprocessa o kardex + o resumo.
// Usado no estorno de torras (a saída gerada é removida).
export function removerMovimentacao(id) {
  const movs = carregarKardex().filter((m) => m.id !== Number(id))
  const { saldoAtual, custoMedio } = recalcular(movs)
  salvarKardex(movs)
  salvarEstoqueResumo({ saldoAtual, custoMedio, ultimaAtualizacao: agoraTexto() })
}
