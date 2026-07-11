// Produtos Acabados (PA) + Ordem de Produção.
//
// Custeio (correções):
//  - Todo o custo do café cru vai para os pacotes EMBALADOS.
//  - custoKgEmbalado = custoTotalCru / totalKgEmbalado
//  - A sobra de torrado entra no estoque de torrado com custo ZERO (só quantidade).
//  - Custo por pacote = (custoKgEmbalado × gramatura_kg) + custo médio da embalagem da gramatura.
//  - Uma ordem pode produzir várias gramaturas de uma vez.
//
// localStorage:
//   pa_cadastro       → [{ id, nome, gramaturas:[g], embalagem250Id, embalagem1000Id, ativo }]
//   pa_estoque        → [{ id, paId, gramatura, quantidade, custoUnitario, custoTotal, data, ordemId }]
//   pa_movimentacoes  → histórico de movimentações de PA (entrada por produção)
//   ordens_producao   → histórico completo das ordens (itens por gramatura + refs p/ estorno)

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

export function embalagensPadrao() {
  const insumos = carregarInsumos()
  return {
    embalagem250Id: insumos.find((i) => i.nome === 'Embalagem 250g')?.id ?? null,
    embalagem1000Id: insumos.find((i) => i.nome === 'Embalagem 1kg')?.id ?? null,
  }
}

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

// Calcula os números de uma ordem sem persistir (prévia na tela).
// input: { paId, itens:[{gramatura, quantidade}], lotes:[{loteId, kg}], sobra }
export function calcularOrdem(input) {
  const pa = carregarPA().find((p) => p.id === Number(input.paId)) || null
  const sobra = Number(String(input.sobra).replace(',', '.')) || 0

  // Lotes usados (com custo do próprio lote)
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
        variedade: lote.variedade || '',
        saldoDisponivel: Number(lote.saldoDisponivel) || 0,
        kg,
        custoPorKg,
        custoTotalLote: kg * custoPorKg,
      }
    })
    .filter(Boolean)

  const totalCru = lotes.reduce((s, l) => s + l.kg, 0)
  const custoTotalCru = lotes.reduce((s, l) => s + l.custoTotalLote, 0)

  // Itens por gramatura
  const resumoIns = resumoPorInsumo()
  const insumos = carregarInsumos()
  const itensBrutos = (input.itens || [])
    .map((it) => ({
      gramatura: Number(it.gramatura) || 0,
      quantidade: Number(it.quantidade) || 0,
    }))
    .filter((it) => it.gramatura > 0 && it.quantidade > 0)

  const totalKgEmbalado = itensBrutos.reduce((s, it) => s + (it.quantidade * it.gramatura) / 1000, 0)
  const custoKgEmbalado = totalKgEmbalado > 0 ? custoTotalCru / totalKgEmbalado : 0

  const itens = itensBrutos.map((it) => {
    const gramaturaKg = it.gramatura / 1000
    const embalagemId = embalagemDoPA(pa, it.gramatura)
    const embNome = embalagemId ? insumos.find((i) => i.id === embalagemId)?.nome || 'Embalagem' : null
    const custoUnitarioCafe = custoKgEmbalado * gramaturaKg
    const custoUnitarioEmbalagem = embalagemId ? Number(resumoIns[embalagemId]?.custoMedio) || 0 : 0
    const custoUnitarioTotal = custoUnitarioCafe + custoUnitarioEmbalagem
    return {
      gramatura: it.gramatura,
      quantidade: it.quantidade,
      embaladoKg: it.quantidade * gramaturaKg,
      embalagemId,
      embNome,
      custoUnitarioCafe,
      custoUnitarioEmbalagem,
      custoUnitarioTotal,
      custoTotalCafe: custoUnitarioCafe * it.quantidade,
      custoTotalEmbalagem: custoUnitarioEmbalagem * it.quantidade,
      custoTotalGramatura: custoUnitarioTotal * it.quantidade,
    }
  })

  const perda = totalCru - totalKgEmbalado - sobra
  const custoTotalCafe = itens.reduce((s, it) => s + it.custoTotalCafe, 0)
  const custoTotalEmbalagens = itens.reduce((s, it) => s + it.custoTotalEmbalagem, 0)

  return {
    pa,
    lotes,
    totalCru,
    custoTotalCru,
    totalKgEmbalado,
    custoKgEmbalado,
    itens,
    sobra,
    perda,
    custoTotalCafe,
    custoTotalEmbalagens,
    custoTotalGeral: custoTotalCafe + custoTotalEmbalagens,
  }
}

// Registra a ordem: baixa cru, gera sobra (custo zero), baixa embalagens por gramatura
// e produz os pacotes de PA.
export function registrarOrdem(input) {
  const data = input.data || hojeISO()
  const calc = calcularOrdem(input)
  const { pa, lotes, sobra, itens } = calc

  const descBase = `Produção ${data} — ${pa?.nome || 'PA'}`

  // (a) baixa cada lote de café cru + saída no kardex do cru (custo e grupo do lote)
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
      produtor: l.produtor,
      variedade: l.variedade,
      quantidade: l.kg,
      custoUnitario: l.custoPorKg,
    })
    return { ...l, movCruId: mov?.id ?? null }
  })
  salvarLotesCru(lotesAtual)

  // (b) sobra torrada → entrada no kardex do torrado com custo ZERO
  let movTorradoId = null
  if (sobra > 0) {
    const mov = registrarMovimentacaoTorrado({
      tipo: TIPOS_MOV.ENTRADA,
      data,
      descricao: `${descBase} — sobra de torra (custo zero)`,
      quantidade: sobra,
      custoUnitario: 0,
    })
    movTorradoId = mov?.id ?? null
  }

  // (c/d) por gramatura: baixa embalagem + registro no estoque de PA
  let paEstoque = carregarPAEstoque()
  let paMov = carregarPAMovimentacoes()
  const ordens = carregarOrdens()
  const ordemId = ordens.reduce((m, o) => Math.max(m, o.id || 0), 0) + 1
  let nextEstoqueId = paEstoque.reduce((m, r) => Math.max(m, r.id || 0), 0) + 1
  let nextMovId = paMov.reduce((m, r) => Math.max(m, r.id || 0), 0) + 1

  const itensOrdem = itens.map((it) => {
    // baixa embalagem no kardex de insumos
    let movInsumoId = null
    if (it.embalagemId && it.quantidade > 0) {
      const mov = registrarMovimentacaoInsumo({
        insumoId: it.embalagemId,
        tipo: TIPOS_MOV.SAIDA,
        data,
        descricao: `${descBase} ${formatarGramatura(it.gramatura)}`,
        quantidade: it.quantidade,
      })
      movInsumoId = mov?.id ?? null
    }

    const paEstoqueId = nextEstoqueId++
    const paMovId = nextMovId++
    const registroEstoque = {
      id: paEstoqueId,
      paId: pa?.id ?? null,
      gramatura: it.gramatura,
      quantidade: it.quantidade,
      custoUnitario: it.custoUnitarioTotal,
      custoTotal: it.custoTotalGramatura,
      data,
      ordemId,
    }
    paEstoque = [...paEstoque, registroEstoque]
    paMov = [
      ...paMov,
      {
        id: paMovId,
        ordemId,
        data,
        tipo: TIPOS_MOV.ENTRADA,
        paId: pa?.id ?? null,
        paNome: pa?.nome || '',
        gramatura: it.gramatura,
        quantidade: it.quantidade,
        custoUnitario: it.custoUnitarioTotal,
        custoTotal: it.custoTotalGramatura,
      },
    ]

    return {
      gramatura: it.gramatura,
      quantidade: it.quantidade,
      embaladoKg: it.embaladoKg,
      embalagemId: it.embalagemId,
      embNome: it.embNome,
      custoUnitarioCafe: it.custoUnitarioCafe,
      custoUnitarioEmbalagem: it.custoUnitarioEmbalagem,
      custoUnitarioTotal: it.custoUnitarioTotal,
      custoTotalGramatura: it.custoTotalGramatura,
      movInsumoId,
      paEstoqueId,
      paMovId,
    }
  })

  salvarPAEstoque(paEstoque)
  salvarPAMovimentacoes(paMov)

  // (e) histórico da ordem
  const ordem = {
    id: ordemId,
    data,
    paId: pa?.id ?? null,
    paNome: pa?.nome || '',
    totalCru: calc.totalCru,
    custoTotalCru: calc.custoTotalCru,
    totalKgEmbalado: calc.totalKgEmbalado,
    custoKgEmbalado: calc.custoKgEmbalado,
    sobra: calc.sobra,
    perda: calc.perda,
    custoTotalCafe: calc.custoTotalCafe,
    custoTotalEmbalagens: calc.custoTotalEmbalagens,
    custoTotal: calc.custoTotalGeral,
    lotes: lotesUsados,
    itens: itensOrdem,
    movTorradoId,
  }
  salvarOrdens([...ordens, ordem])
  return ordem
}

// Estorna uma ordem: devolve cru aos lotes, remove sobra, devolve embalagens e apaga PA.
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

  // (c/d) por item: devolve embalagem + remove registros de PA
  // Compatível com ordens antigas (formato de gramatura única).
  const itens = ordem.itens || [
    { movInsumoId: ordem.movInsumoId, paEstoqueId: ordem.paEstoqueId, paMovId: ordem.paMovId },
  ]
  const estoqueIds = new Set()
  const movIds = new Set()
  for (const it of itens) {
    if (it.movInsumoId != null) removerMovimentacaoInsumo(it.movInsumoId)
    if (it.paEstoqueId != null) estoqueIds.add(Number(it.paEstoqueId))
    if (it.paMovId != null) movIds.add(Number(it.paMovId))
  }
  salvarPAEstoque(carregarPAEstoque().filter((r) => !estoqueIds.has(Number(r.id))))
  salvarPAMovimentacoes(carregarPAMovimentacoes().filter((r) => !movIds.has(Number(r.id))))

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
