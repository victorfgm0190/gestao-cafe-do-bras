// Café torrado (PP): estoque gerado pela Ordem de Torra a partir do café cru.
//
// localStorage:
//   estoque_cafe_torrado → { saldoAtual, custoMedio, ultimaAtualizacao }
//   kardex_cafe_torrado  → [{ id, data, tipo, descricao, quantidade, custoUnitario,
//                             custoTotal, saldoAcumulado, custoMedio }]
//   torras_cafe          → histórico das torras (dados que não cabem no kardex)
//
// O café torrado NÃO é comprado: cada torra baixa peso do café cru e gera o torrado.
//   custo unitário do torrado = (peso_cru × custo_médio_cru) / peso_torrado

import { hojeISO, formatarData } from './formato'
import {
  TIPOS_MOV,
  registrarMovimentacao as registrarMovCru,
  removerMovimentacao as removerMovCru,
  carregarKardex as carregarKardexCru,
  carregarEstoqueResumo as carregarResumoCru,
  garantirKardexInicial as garantirKardexCru,
} from './kardex'

export const CHAVE_ESTOQUE_TORRADO = 'estoque_cafe_torrado'
export const CHAVE_KARDEX_TORRADO = 'kardex_cafe_torrado'
export const CHAVE_TORRAS = 'torras_historico'
const CHAVE_TORRAS_ANTIGA = 'torras_cafe'
const CHAVE_LOTES_CRU = 'cafe_do_bras_estoque'

export const PERFIS_TORRA = ['Clara', 'Média', 'Escura']

function agoraTexto() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// ---------- Kardex do torrado ----------
export function carregarKardexTorrado() {
  try {
    const bruto = localStorage.getItem(CHAVE_KARDEX_TORRADO)
    const dado = bruto ? JSON.parse(bruto) : []
    return Array.isArray(dado) ? dado : []
  } catch {
    return []
  }
}

function salvarKardexTorrado(lista) {
  localStorage.setItem(CHAVE_KARDEX_TORRADO, JSON.stringify(lista))
}

// Remove uma movimentação do kardex do torrado pelo id e reprocessa o resumo.
export function removerMovimentacaoTorrado(id) {
  const movs = carregarKardexTorrado().filter((m) => m.id !== Number(id))
  const { saldoAtual, custoMedio } = recalcular(movs)
  salvarKardexTorrado(movs)
  salvarEstoqueTorrado({ saldoAtual, custoMedio, ultimaAtualizacao: agoraTexto() })
}

function salvarEstoqueTorrado(resumo) {
  localStorage.setItem(CHAVE_ESTOQUE_TORRADO, JSON.stringify(resumo))
}

function ordenar(a, b) {
  return (a.data || '').localeCompare(b.data || '') || (a.id || 0) - (b.id || 0)
}

// Reprocessa o kardex (fluxo único) preenchendo saldo e custo médio ponderado.
function recalcular(movs) {
  let saldo = 0
  let custoMedio = 0
  for (const m of movs) {
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
  return { saldoAtual: saldo, custoMedio }
}

export function carregarEstoqueTorrado() {
  try {
    const bruto = localStorage.getItem(CHAVE_ESTOQUE_TORRADO)
    if (bruto) return JSON.parse(bruto)
  } catch {
    /* deriva abaixo */
  }
  const { saldoAtual, custoMedio } = recalcular(carregarKardexTorrado())
  return { saldoAtual, custoMedio, ultimaAtualizacao: null }
}

// Registra uma movimentação no kardex do torrado e atualiza o resumo.
// input: { tipo, descricao, quantidade (positiva), custoUnitario, data, sentido }
export function registrarMovimentacaoTorrado(input) {
  const movs = carregarKardexTorrado()
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
    data: input.data || hojeISO(),
    tipo: input.tipo,
    descricao: input.descricao || '',
    quantidade: delta,
    custoUnitario,
    custoTotal: 0,
    saldoAcumulado: 0,
    custoMedio: 0,
  }

  const todos = [...movs, registro].sort(ordenar)
  const { saldoAtual, custoMedio } = recalcular(todos)
  salvarKardexTorrado(todos)
  salvarEstoqueTorrado({ saldoAtual, custoMedio, ultimaAtualizacao: agoraTexto() })
  return registro
}

// ---------- Café cru (origem) ----------
function carregarLotesCru() {
  try {
    const bruto = localStorage.getItem(CHAVE_LOTES_CRU)
    const dado = bruto ? JSON.parse(bruto) : []
    return Array.isArray(dado) ? dado : []
  } catch {
    return []
  }
}

function salvarLotesCru(lista) {
  localStorage.setItem(CHAVE_LOTES_CRU, JSON.stringify(lista))
}

// Lotes de café cru com saldo disponível (para o select da Ordem de Torra).
export function lotesCruDisponiveis() {
  return carregarLotesCru().filter((l) => (Number(l.saldoDisponivel) || 0) > 0)
}

export function loteCruPorId(id) {
  return carregarLotesCru().find((l) => l.id === Number(id)) || null
}

// Custo médio ponderado atual do café cru.
export function custoMedioCru() {
  garantirKardexCru()
  return Number(carregarResumoCru().custoMedio) || 0
}

// ---------- Histórico de torras ----------
export function carregarTorras() {
  try {
    let bruto = localStorage.getItem(CHAVE_TORRAS)
    if (!bruto) {
      // Migra do nome de chave antigo, se existir.
      const antigo = localStorage.getItem(CHAVE_TORRAS_ANTIGA)
      if (antigo) {
        localStorage.setItem(CHAVE_TORRAS, antigo)
        bruto = antigo
      }
    }
    const dado = bruto ? JSON.parse(bruto) : []
    return Array.isArray(dado) ? dado : []
  } catch {
    return []
  }
}

function salvarTorras(lista) {
  localStorage.setItem(CHAVE_TORRAS, JSON.stringify(lista))
}

// Registra uma torra: baixa o café cru, lança saída no kardex do cru e entrada no torrado.
// input: { data, loteId, pesoCru, pesoTorrado, perfil, observacao }
export function registrarTorra(input) {
  garantirKardexCru() // garante o kardex do cru semeado

  const pesoCru = Number(String(input.pesoCru).replace(',', '.')) || 0
  const pesoTorrado = Number(String(input.pesoTorrado).replace(',', '.')) || 0
  const data = input.data || hojeISO()

  const lotes = carregarLotesCru()
  const lote = lotes.find((l) => l.id === Number(input.loteId))
  if (!lote) throw new Error('Lote de café cru não encontrado.')

  // Custo do próprio lote selecionado (não o custo médio global do estoque).
  const custoLote = Number(lote.custoPorKg) || 0

  // (a) baixa o peso cru do lote
  const novoSaldo = Math.max(0, (Number(lote.saldoDisponivel) || 0) - pesoCru)
  salvarLotesCru(
    lotes.map((l) =>
      l.id === lote.id
        ? { ...l, saldoDisponivel: novoSaldo, status: novoSaldo > 0 ? 'disponivel' : 'esgotado' }
        : l,
    ),
  )

  // (b) saída no kardex do café cru, valorizada pelo custo do próprio lote
  const movCru = registrarMovCru({
    tipo: TIPOS_MOV.SAIDA,
    data,
    descricao: `Torra ${formatarData(data)} — ${lote.codigo || 'lote'}`,
    quantidade: pesoCru,
    custoUnitario: custoLote,
  })

  // (c) custo do torrado = (peso cru × custo do lote) / peso torrado
  const custoTorradoUnit = pesoTorrado > 0 ? (pesoCru * custoLote) / pesoTorrado : 0

  // (d) entrada no kardex do café torrado
  const movTorrado = registrarMovimentacaoTorrado({
    tipo: TIPOS_MOV.ENTRADA,
    data,
    descricao: `Torra ${formatarData(data)} — ${lote.codigo || 'lote'} (${input.perfil})`,
    quantidade: pesoTorrado,
    custoUnitario: custoTorradoUnit,
  })

  // (f) histórico da torra
  const torras = carregarTorras()
  const registro = {
    id: torras.reduce((max, t) => Math.max(max, t.id || 0), 0) + 1,
    data,
    loteId: lote.id,
    loteCodigo: lote.codigo || '',
    produtor: lote.produtor || '',
    pesoCru,
    pesoTorrado,
    perda: pesoCru - pesoTorrado,
    rendimento: pesoCru > 0 ? (pesoTorrado / pesoCru) * 100 : 0,
    perfil: input.perfil,
    observacao: (input.observacao || '').trim(),
    custoPorKgLote: custoLote,
    custoTorradoUnit,
    movCruId: movCru?.id ?? null, // saída gerada no kardex do cru
    movTorradoId: movTorrado?.id ?? null, // entrada gerada no kardex do torrado
  }
  salvarTorras([...torras, registro])
  return registro
}

// Localiza o id da saída do cru gerada por uma torra (usa o id salvo ou casa por descrição).
function idSaidaCru(torra) {
  if (torra.movCruId) return torra.movCruId
  const alvo = `Torra ${formatarData(torra.data)}`
  const m = carregarKardexCru().find(
    (x) =>
      x.tipo === TIPOS_MOV.SAIDA &&
      (x.descricao || '').startsWith(alvo) &&
      Math.abs((Number(x.quantidade) || 0) + (Number(torra.pesoCru) || 0)) < 1e-6,
  )
  return m ? m.id : null
}

function idEntradaTorrado(torra) {
  if (torra.movTorradoId) return torra.movTorradoId
  const alvo = `Torra ${formatarData(torra.data)}`
  const m = carregarKardexTorrado().find(
    (x) =>
      x.tipo === TIPOS_MOV.ENTRADA &&
      (x.descricao || '').startsWith(alvo) &&
      Math.abs((Number(x.quantidade) || 0) - (Number(torra.pesoTorrado) || 0)) < 1e-6,
  )
  return m ? m.id : null
}

// Estorna uma torra: devolve o cru ao lote, remove as movimentações geradas e
// tira a torra do histórico. Recalcula os saldos/custos dos dois kardex.
export function estornarTorra(torraId) {
  const torras = carregarTorras()
  const torra = torras.find((t) => t.id === Number(torraId))
  if (!torra) return null

  // (b/e) devolve o peso cru ao lote de origem
  const lotes = carregarLotesCru()
  const lote = lotes.find((l) => l.id === Number(torra.loteId))
  if (lote) {
    const novoSaldo = (Number(lote.saldoDisponivel) || 0) + (Number(torra.pesoCru) || 0)
    salvarLotesCru(
      lotes.map((l) =>
        l.id === lote.id
          ? { ...l, saldoDisponivel: novoSaldo, status: novoSaldo > 0 ? 'disponivel' : 'esgotado' }
          : l,
      ),
    )
  }

  // (b) estorna a saída no kardex do cru
  const cruId = idSaidaCru(torra)
  if (cruId != null) removerMovCru(cruId)

  // (c/d) remove a entrada no kardex do torrado e recalcula
  const torradoId = idEntradaTorrado(torra)
  if (torradoId != null) removerMovimentacaoTorrado(torradoId)

  // (a) remove a torra do histórico
  salvarTorras(torras.filter((t) => t.id !== Number(torra.id)))
  return torra
}
