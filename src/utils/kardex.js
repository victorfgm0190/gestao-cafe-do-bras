// Kardex do café cru com custo médio ponderado ISOLADO por fazenda (produtor) + variedade.
//
// Regra de custeio: o custo médio só agrega lotes do mesmo grupo (produtor + variedade).
// Cafés diferentes têm custos separados — nunca misturados.
//
// Estruturas no localStorage:
//   kardex_cafe_cru  → array de movimentações
//     { id, data, tipo, descricao, produtor, variedade, grupo, quantidade,
//       custoUnitario, custoTotal, saldoAcumulado, custoMedio }
//     obs.: `quantidade` é o efeito no saldo (positivo = entra, negativo = sai);
//           `saldoAcumulado`/`custoMedio` são corridos DENTRO do grupo.
//   estoque_cafe_cru → { saldoAtual, custoMedio, ultimaAtualizacao } (total geral, p/ dashboard)

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

// Chave do grupo de custeio: fazenda (produtor) + variedade.
export function chaveGrupo(produtor, variedade) {
  return `${(produtor || '').trim()}|${(variedade || '').trim()}`
}

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
function ordenar(a, b) {
  return (a.data || '').localeCompare(b.data || '') || (a.id || 0) - (b.id || 0)
}

function grupoDe(m) {
  return m.grupo || chaveGrupo(m.produtor, m.variedade)
}

// Reprocessa o kardex agrupando por (produtor + variedade). Muta os registros
// (saldoAcumulado/custoMedio/custoTotal corridos DENTRO do grupo) e devolve o mapa
// grupo → { chave, produtor, variedade, saldoAtual, custoMedio, valorTotal }.
function recalcular(movs) {
  const grupos = {}
  for (const m of movs) {
    const chave = grupoDe(m)
    ;(grupos[chave] = grupos[chave] || []).push(m)
  }
  const resumo = {}
  for (const chave of Object.keys(grupos)) {
    let saldo = 0
    let custoMedio = 0
    for (const m of grupos[chave].sort(ordenar)) {
      const q = Number(m.quantidade) || 0
      const custoEntrada = Number(m.custoUnitario) || 0
      if (q > 0 && custoEntrada > 0) {
        const novoSaldo = saldo + q
        custoMedio = novoSaldo > 0 ? (saldo * custoMedio + q * custoEntrada) / novoSaldo : 0
        saldo = novoSaldo
        m.custoUnitario = custoEntrada
      } else {
        // Saída / perda / ajuste: o saldo diminui e o custo médio do grupo NÃO muda.
        // A saída é sempre valorizada pelo custo médio ponderado VIGENTE do grupo.
        saldo = saldo + q
        m.custoUnitario = custoMedio
      }
      m.saldoAcumulado = saldo
      m.custoMedio = custoMedio
      m.custoTotal = Math.abs(q) * m.custoUnitario
    }
    const rep = grupos[chave].find((x) => x.produtor || x.variedade) || {}
    resumo[chave] = {
      chave,
      produtor: rep.produtor || '',
      variedade: rep.variedade || '',
      saldoAtual: saldo,
      custoMedio,
      valorTotal: saldo * custoMedio,
    }
  }
  return resumo
}

// Totais gerais a partir do mapa por grupo.
function totaisDe(resumoGrupos) {
  let saldo = 0
  let valor = 0
  for (const g of Object.values(resumoGrupos)) {
    saldo += g.saldoAtual
    valor += g.valorTotal
  }
  return { saldoAtual: saldo, custoMedio: saldo > 0 ? valor / saldo : 0 }
}

// Semeia o kardex a partir dos lotes já cadastrados (uma única vez), um registro por lote
// já vinculado ao seu grupo (produtor + variedade).
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
      produtor: l.produtor || '',
      variedade: l.variedade || '',
      grupo: chaveGrupo(l.produtor, l.variedade),
      quantidade: Number(l.pesoTotal) || 0,
      custoUnitario: Number(l.custoPorKg) || 0,
      custoTotal: 0,
      saldoAcumulado: 0,
      custoMedio: 0,
    }))

  const resumoGrupos = recalcular(movs)
  salvarKardex(movs)
  salvarEstoqueResumo({ ...totaisDe(resumoGrupos), ultimaAtualizacao: agoraTexto() })
}

// Resumo TOTAL do estoque (saldo e custo médio geral) — usado no dashboard.
export function carregarEstoqueResumo() {
  try {
    const bruto = localStorage.getItem(CHAVE_ESTOQUE)
    if (bruto) return JSON.parse(bruto)
  } catch {
    /* ignora e deriva abaixo */
  }
  return { ...totaisDe(recalcular(carregarKardex())), ultimaAtualizacao: null }
}

// Custo médio ponderado ATUAL de um grupo (fazenda + variedade).
// Usado pelas saídas (produção/torra) para valorizar o café cru consumido.
export function custoMedioGrupo(produtor, variedade) {
  garantirKardexInicial()
  const resumo = recalcular(carregarKardex())
  return Number(resumo[chaveGrupo(produtor, variedade)]?.custoMedio) || 0
}

// Resumo por grupo (fazenda + variedade).
export function carregarEstoqueResumoPorGrupo() {
  const resumo = recalcular(carregarKardex())
  return Object.values(resumo)
    .filter((g) => g.saldoAtual > 1e-9 || g.valorTotal > 1e-9)
    .sort((a, b) => (a.produtor || '').localeCompare(b.produtor || '') || (a.variedade || '').localeCompare(b.variedade || ''))
}

// Registra uma movimentação e reprocessa o kardex + o resumo.
// input: { tipo, descricao, quantidade, custoUnitario, data, sentido, produtor, variedade }
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
  // Entradas usam o custo de compra informado; saídas são valorizadas pelo custo médio
  // vigente do grupo (preenchido no recálculo, não no valor informado).
  const custoInformado = delta > 0 ? Number(String(input.custoUnitario).replace(',', '.')) || 0 : 0

  const registro = {
    id: proximoId,
    data: input.data || hojeISO(),
    tipo: input.tipo,
    descricao: input.descricao || '',
    produtor: input.produtor || '',
    variedade: input.variedade || '',
    grupo: chaveGrupo(input.produtor, input.variedade),
    quantidade: delta,
    custoUnitario: custoInformado,
    custoTotal: 0,
    saldoAcumulado: 0,
    custoMedio: 0,
  }

  const todos = [...movs, registro].sort(ordenar)
  const resumoGrupos = recalcular(todos)
  salvarKardex(todos)
  salvarEstoqueResumo({ ...totaisDe(resumoGrupos), ultimaAtualizacao: agoraTexto() })
  return registro
}

// Remove uma movimentação pelo id e reprocessa o kardex + o resumo.
export function removerMovimentacao(id) {
  const movs = carregarKardex().filter((m) => m.id !== Number(id))
  const resumoGrupos = recalcular(movs)
  salvarKardex(movs)
  salvarEstoqueResumo({ ...totaisDe(resumoGrupos), ultimaAtualizacao: agoraTexto() })
}
