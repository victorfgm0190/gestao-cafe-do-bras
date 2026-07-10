// Produtos Acabados (PA) + Ordem de Produção.
//
// localStorage:
//   pa_cadastro       → [{ id, nome, gramaturas:[g], embalagem250Id, embalagem1000Id, ativo }]
//   pa_estoque        → [{ id, paId, gramatura, quantidade, custoUnitario, custoTotal, data, ordemId }]
//   pa_movimentacoes  → histórico de movimentações de PA (entrada por produção)
//   ordens_producao   → histórico completo das ordens (com refs para estorno)
//
// Uma Ordem de Produção consome café cru (mix de lotes), pode gerar sobra de torrado,
// baixa embalagens e produz pacotes de PA.

import { hojeISO } from './formato'
import {
  TIPOS_MOV,
  registrarMovimentacao as registrarMovCru,
  removerMovimentacao as removerMovCru,
} from './kardex'
import { registrarMovimentacaoTorrado, removerMovimentacaoTorrado } from './torrado'
import {
  carregarCadastro as carregarInsumos,
  registrarMovimentacaoInsumo,
  removerMovimentacaoInsumo,
  resumoPorInsumo,
} from './insumos'

const CHAVE_PA = 'pa_cadastro'
const CHAVE_PA_ESTOQUE = 'pa_estoque'
const CHAVE_PA_MOV = 'pa_movimentacoes'
const CHAVE_ORDENS = 'ordens_producao'
const CHAVE_LOTES_CRU = 'cafe_do_bras_estoque'

export const GRAMATURAS = [200, 250, 1000]

export function formatarGramatura(g) {
  const n = Number(g) || 0
  return n === 1000 ? '1kg' : `${n}g`
}

// ---------- Cadastro de PA ----------
function seedPA() {
  const insumos = carregarInsumos()
  const emb250 = insumos.find((i) => i.nome === 'Embalagem 250g')
  const emb1000 = insumos.find((i) => i.nome === 'Embalagem 1kg')
  const nomes = ['Chocolatudo', 'Frutado e Floral', 'Garapa com Limão', 'Monstro do Lago Ness', 'Pyta']
  return nomes.map((nome, i) => ({
    id: i + 1,
    nome,
    gramaturas: [250, 1000],
    embalagem250Id: emb250?.id ?? null,
    embalagem1000Id: emb1000?.id ?? null,
    ativo: true,
  }))
}

export function carregarPA() {
  try {
    const bruto = localStorage.getItem(CHAVE_PA)
    if (!bruto) {
      const seed = seedPA()
      localStorage.setItem(CHAVE_PA, JSON.stringify(seed))
      return seed
    }
    const dado = JSON.parse(bruto)
    return Array.isArray(dado) ? dado : []
  } catch {
    return []
  }
}

export function salvarPA(lista) {
  localStorage.setItem(CHAVE_PA, JSON.stringify(lista))
}

export function proximoIdPA(lista) {
  return lista.reduce((max, p) => Math.max(max, p.id || 0), 0) + 1
}

// Resolve o insumo de embalagem por nome (para vincular novos PAs automaticamente).
export function embalagensPadrao() {
  const insumos = carregarInsumos()
  return {
    embalagem250Id: insumos.find((i) => i.nome === 'Embalagem 250g')?.id ?? null,
    embalagem1000Id: insumos.find((i) => i.nome === 'Embalagem 1kg')?.id ?? null,
  }
}

// Insumo de embalagem correspondente a uma gramatura do PA.
export function embalagemDoPA(pa, gramatura) {
  if (Number(gramatura) === 250) return pa?.embalagem250Id ?? null
  if (Number(gramatura) === 1000) return pa?.embalagem1000Id ?? null
  return null // 200g não tem embalagem vinculada por padrão
}

// ---------- Lotes de café cru ----------
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

export function lotesCruDisponiveis() {
  return carregarLotesCru().filter((l) => (Number(l.saldoDisponivel) || 0) > 0)
}

// ---------- PA estoque / movimentações / ordens ----------
export function carregarPAEstoque() {
  try {
    const bruto = localStorage.getItem(CHAVE_PA_ESTOQUE)
    const dado = bruto ? JSON.parse(bruto) : []
    return Array.isArray(dado) ? dado : []
  } catch {
    return []
  }
}
function salvarPAEstoque(lista) {
  localStorage.setItem(CHAVE_PA_ESTOQUE, JSON.stringify(lista))
}

export function carregarPAMovimentacoes() {
  try {
    const bruto = localStorage.getItem(CHAVE_PA_MOV)
    const dado = bruto ? JSON.parse(bruto) : []
    return Array.isArray(dado) ? dado : []
  } catch {
    return []
  }
}
function salvarPAMovimentacoes(lista) {
  localStorage.setItem(CHAVE_PA_MOV, JSON.stringify(lista))
}

export function carregarOrdens() {
  try {
    const bruto = localStorage.getItem(CHAVE_ORDENS)
    const dado = bruto ? JSON.parse(bruto) : []
    return Array.isArray(dado) ? dado : []
  } catch {
    return []
  }
}
function salvarOrdens(lista) {
  localStorage.setItem(CHAVE_ORDENS, JSON.stringify(lista))
}

// Calcula os números de uma ordem sem persistir (para prévia na tela).
// input: { paId, gramatura, quantidade, lotes:[{loteId, kg}], sobra }
export function calcularOrdem(input) {
  const pa = carregarPA().find((p) => p.id === Number(input.paId)) || null
  const gramatura = Number(input.gramatura) || 0
  const quantidade = Number(input.quantidade) || 0
  const sobra = Number(String(input.sobra).replace(',', '.')) || 0

  const embaladoKg = (quantidade * gramatura) / 1000

  const lotesCru = carregarLotesCru()
  const lotes = (input.lotes || [])
    .map((li) => {
      const lote = lotesCru.find((l) => l.id === Number(li.loteId))
      const kg = Number(String(li.kg).replace(',', '.')) || 0
      if (!lote || kg <= 0) return null
      const custoPorKg = Number(lote.custoPorKg) || 0
      return {
        loteId: lote.id,
        loteCodigo: lote.codigo || '',
        produtor: lote.produtor || '',
        saldoDisponivel: Number(lote.saldoDisponivel) || 0,
        kg,
        custoPorKg,
        custoTotalLote: kg * custoPorKg,
      }
    })
    .filter(Boolean)

  const totalCru = lotes.reduce((s, l) => s + l.kg, 0)
  const custoCruTotal = lotes.reduce((s, l) => s + l.custoTotalLote, 0)
  const perda = totalCru - embaladoKg - sobra
  const bomTorrado = embaladoKg + sobra // torrado aproveitado (embalado + sobra)
  const custoPorKgTorrado = bomTorrado > 0 ? custoCruTotal / bomTorrado : 0

  const custoMateriaPrima = embaladoKg * custoPorKgTorrado
  const custoSobra = sobra * custoPorKgTorrado

  const embalagemId = embalagemDoPA(pa, gramatura)
  const custoEmbUnit = embalagemId ? Number(resumoPorInsumo()[embalagemId]?.custoMedio) || 0 : 0
  const custoEmbalagens = quantidade * custoEmbUnit

  const custoTotal = custoMateriaPrima + custoEmbalagens
  const custoUnitario = quantidade > 0 ? custoTotal / quantidade : 0

  return {
    pa,
    gramatura,
    quantidade,
    embaladoKg,
    sobra,
    perda,
    lotes,
    totalCru,
    custoCruTotal,
    custoPorKgTorrado,
    custoMateriaPrima,
    custoSobra,
    embalagemId,
    custoEmbUnit,
    custoEmbalagens,
    custoTotal,
    custoUnitario,
  }
}

// Registra a ordem: baixa cru, gera sobra torrada, baixa embalagens e produz PA.
export function registrarOrdem(input) {
  const data = input.data || hojeISO()
  const calc = calcularOrdem(input)
  const { pa, gramatura, quantidade, embaladoKg, sobra, perda, lotes } = calc

  const descBase = `Produção ${data} — ${pa?.nome || 'PA'} ${formatarGramatura(gramatura)}`

  // (a) baixa cada lote de café cru + saída no kardex do cru (custo do próprio lote)
  const lotesCru = carregarLotesCru()
  let lotesAtual = lotesCru
  const lotesUsados = lotes.map((l) => {
    const alvo = lotesAtual.find((x) => x.id === l.loteId)
    const novoSaldo = Math.max(0, (Number(alvo?.saldoDisponivel) || 0) - l.kg)
    lotesAtual = lotesAtual.map((x) =>
      x.id === l.loteId
        ? { ...x, saldoDisponivel: novoSaldo, status: novoSaldo > 0 ? 'disponivel' : 'esgotado' }
        : x,
    )
    const mov = registrarMovCru({
      tipo: TIPOS_MOV.SAIDA,
      data,
      descricao: descBase,
      quantidade: l.kg,
      custoUnitario: l.custoPorKg,
    })
    return { ...l, movCruId: mov?.id ?? null }
  })
  salvarLotesCru(lotesAtual)

  // (b) sobra torrada → entrada no kardex do torrado
  let movTorradoId = null
  if (sobra > 0) {
    const mov = registrarMovimentacaoTorrado({
      tipo: TIPOS_MOV.ENTRADA,
      data,
      descricao: `${descBase} — sobra de torra`,
      quantidade: sobra,
      custoUnitario: calc.custoPorKgTorrado,
    })
    movTorradoId = mov?.id ?? null
  }

  // (c) baixa embalagens no kardex de insumos
  let movInsumoId = null
  if (calc.embalagemId && quantidade > 0) {
    const mov = registrarMovimentacaoInsumo({
      insumoId: calc.embalagemId,
      tipo: TIPOS_MOV.SAIDA,
      data,
      descricao: descBase,
      quantidade,
    })
    movInsumoId = mov?.id ?? null
  }

  // (d) registro no estoque de PA + movimentação
  const paEstoque = carregarPAEstoque()
  const paEstoqueId = paEstoque.reduce((m, r) => Math.max(m, r.id || 0), 0) + 1
  const paMov = carregarPAMovimentacoes()
  const paMovId = paMov.reduce((m, r) => Math.max(m, r.id || 0), 0) + 1

  const ordens = carregarOrdens()
  const ordemId = ordens.reduce((m, o) => Math.max(m, o.id || 0), 0) + 1

  const registroEstoque = {
    id: paEstoqueId,
    paId: pa?.id ?? null,
    gramatura,
    quantidade,
    custoUnitario: calc.custoUnitario,
    custoTotal: calc.custoTotal,
    data,
    ordemId,
  }
  salvarPAEstoque([...paEstoque, registroEstoque])
  salvarPAMovimentacoes([
    ...paMov,
    {
      id: paMovId,
      ordemId,
      data,
      tipo: TIPOS_MOV.ENTRADA,
      paId: pa?.id ?? null,
      paNome: pa?.nome || '',
      gramatura,
      quantidade,
      custoUnitario: calc.custoUnitario,
      custoTotal: calc.custoTotal,
    },
  ])

  // (e) histórico da ordem (com refs para estorno)
  const ordem = {
    id: ordemId,
    data,
    paId: pa?.id ?? null,
    paNome: pa?.nome || '',
    gramatura,
    quantidade,
    embaladoKg,
    sobra,
    perda,
    totalCru: calc.totalCru,
    custoCruTotal: calc.custoCruTotal,
    custoPorKgTorrado: calc.custoPorKgTorrado,
    custoMateriaPrima: calc.custoMateriaPrima,
    custoEmbalagens: calc.custoEmbalagens,
    custoTotal: calc.custoTotal,
    custoUnitario: calc.custoUnitario,
    lotes: lotesUsados,
    embalagemId: calc.embalagemId,
    movTorradoId,
    movInsumoId,
    paEstoqueId,
    paMovId,
  }
  salvarOrdens([...ordens, ordem])
  return ordem
}

// Estorna uma ordem: devolve o cru aos lotes, remove sobra torrada, devolve embalagens
// e remove os registros de PA/ordem.
export function estornarOrdem(ordemId) {
  const ordens = carregarOrdens()
  const ordem = ordens.find((o) => o.id === Number(ordemId))
  if (!ordem) return null

  // (a) devolve cru aos lotes + remove as saídas do kardex do cru
  const lotesCru = carregarLotesCru()
  let lotesAtual = lotesCru
  for (const l of ordem.lotes || []) {
    const alvo = lotesAtual.find((x) => x.id === Number(l.loteId))
    if (alvo) {
      const novoSaldo = (Number(alvo.saldoDisponivel) || 0) + (Number(l.kg) || 0)
      lotesAtual = lotesAtual.map((x) =>
        x.id === alvo.id
          ? { ...x, saldoDisponivel: novoSaldo, status: novoSaldo > 0 ? 'disponivel' : 'esgotado' }
          : x,
      )
    }
    if (l.movCruId != null) removerMovCru(l.movCruId)
  }
  salvarLotesCru(lotesAtual)

  // (b) remove a sobra torrada
  if (ordem.movTorradoId != null) removerMovimentacaoTorrado(ordem.movTorradoId)

  // (c) devolve embalagens (remove a saída de insumo)
  if (ordem.movInsumoId != null) removerMovimentacaoInsumo(ordem.movInsumoId)

  // (d) remove estoque de PA e movimentação
  salvarPAEstoque(carregarPAEstoque().filter((r) => r.id !== Number(ordem.paEstoqueId)))
  salvarPAMovimentacoes(carregarPAMovimentacoes().filter((r) => r.id !== Number(ordem.paMovId)))

  // (e) remove a ordem
  salvarOrdens(ordens.filter((o) => o.id !== Number(ordem.id)))
  return ordem
}

// Estoque de PA agregado por produto + gramatura (custo médio ponderado).
export function resumoPAEstoque() {
  const registros = carregarPAEstoque()
  const pas = carregarPA()
  const nomePorId = {}
  for (const p of pas) nomePorId[p.id] = p.nome

  const grupos = {}
  for (const r of registros) {
    const chave = `${r.paId}|${r.gramatura}`
    if (!grupos[chave]) {
      grupos[chave] = {
        paId: r.paId,
        paNome: nomePorId[r.paId] || `#${r.paId}`,
        gramatura: r.gramatura,
        quantidade: 0,
        custoTotal: 0,
      }
    }
    grupos[chave].quantidade += Number(r.quantidade) || 0
    grupos[chave].custoTotal += Number(r.custoTotal) || 0
  }

  return Object.values(grupos).map((g) => ({
    ...g,
    custoMedio: g.quantidade > 0 ? g.custoTotal / g.quantidade : 0,
    valorTotal: g.custoTotal,
  }))
}
