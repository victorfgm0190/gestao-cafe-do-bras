// Lógica de negócio de Produtos Acabados (PA) + Ordem de Produção.
// Arquivos começando com "_" NÃO viram rotas na Vercel.
//
// Custeio (espelha src/utils/pa.js):
//   - Todo o custo do café cru vai para os pacotes EMBALADOS.
//   - custoKgEmbalado = custoTotalCru / totalKgEmbalado
//   - A sobra de torrado entra no torrado com custo ZERO (só quantidade).
//   - Custo por pacote = (custoKgEmbalado × gramatura_kg) + custo médio da embalagem.

import { sql } from '../db.js'
import { chaveGrupo, custoMedioAtualGrupo } from '../cafe-cru/_lib.js'
import { resumoPorInsumo } from '../insumos/_lib.js'

export const TIPOS_MOV = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  AJUSTE: 'Ajuste',
  PERDA: 'Perda',
}

export const GRAMATURAS = [200, 250, 1000, 'drip']

const num = (v) => Number(String(v ?? '').replace(',', '.')) || 0

export function formatarGramatura(g) {
  if (g === 'drip') return 'Drip (10g)'
  const n = Number(g) || 0
  return n === 1000 ? '1kg' : `${n}g`
}

// Embalagem vinculada a uma gramatura do PA (linha do banco, snake_case).
export function embalagemDoPA(pa, gramatura) {
  if (gramatura === 'drip') return pa?.embalagem_drip_id ?? null
  if (Number(gramatura) === 200) return pa?.embalagem_200_id ?? null
  if (Number(gramatura) === 250) return pa?.embalagem_250_id ?? null
  if (Number(gramatura) === 1000) return pa?.embalagem_1000_id ?? null
  return null
}

// Calcula os números de uma ordem sem persistir (prévia).
// input: { paId, itens:[{gramatura, quantidade}], lotes:[{loteId, kg}], sobra }
export async function calcularOrdem(input) {
  const paRows = await sql`SELECT * FROM pa_cadastro WHERE id = ${Number(input.paId)} LIMIT 1`
  const pa = paRows[0] || null
  const sobra = num(input.sobra)

  // Nomes de insumos (para embNome) + resumo de custo médio dos insumos.
  const insumos = await sql`SELECT id, nome FROM insumos_cadastro`
  const nomeInsumo = {}
  for (const i of insumos) nomeInsumo[i.id] = i.nome
  const resumoIns = await resumoPorInsumo()

  // Lotes usados (custo médio ATUAL do grupo fazenda+variedade do lote).
  const lotes = []
  for (const li of input.lotes || []) {
    const kg = num(li.kg)
    if (kg <= 0) continue
    const lr = await sql`SELECT * FROM lotes_cafe_cru WHERE id = ${Number(li.loteId)} LIMIT 1`
    const lote = lr[0]
    if (!lote) continue
    const grupo = chaveGrupo(lote.fazenda, lote.variedade)
    const custoPorKg = (await custoMedioAtualGrupo(grupo)) || Number(lote.preco_kg) || 0
    lotes.push({
      loteId: lote.id,
      loteCodigo: lote.codigo_lote || '',
      produtor: lote.fazenda || '',
      variedade: lote.variedade || '',
      saldoDisponivel: Number(lote.saldo_disponivel) || 0,
      kg,
      custoPorKg,
      custoTotalLote: kg * custoPorKg,
    })
  }

  const totalCru = lotes.reduce((s, l) => s + l.kg, 0)
  const custoTotalCru = lotes.reduce((s, l) => s + l.custoTotalLote, 0)

  const itensBrutos = (input.itens || [])
    .map((it) => ({ gramatura: Number(it.gramatura) || 0, quantidade: Number(it.quantidade) || 0 }))
    .filter((it) => it.gramatura > 0 && it.quantidade > 0)

  const totalKgEmbalado = itensBrutos.reduce((s, it) => s + (it.quantidade * it.gramatura) / 1000, 0)
  const custoKgEmbalado = totalKgEmbalado > 0 ? custoTotalCru / totalKgEmbalado : 0

  const itens = itensBrutos.map((it) => {
    const gramaturaKg = it.gramatura / 1000
    const embalagemId = embalagemDoPA(pa, it.gramatura)
    const embNome = embalagemId ? nomeInsumo[embalagemId] || 'Embalagem' : null
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

// Ajuste avulso de estoque de PA (usado pelo inventário: sobra ou saída não
// identificada). quantidade positiva = entrada; negativa = saída.
export async function ajustarEstoquePA({ paId, gramatura, quantidade, descricao, data }) {
  const q = num(quantidade)
  const dataRef = data || new Date().toISOString().slice(0, 10)
  const resumo = await resumoPAEstoque()
  const atual = resumo.find((r) => r.paId === Number(paId) && Number(r.gramatura) === Number(gramatura))
  const custoUnit = atual ? Number(atual.custoMedio) || 0 : 0

  const est = await sql`
    INSERT INTO pa_estoque (pa_id, gramatura, quantidade, custo_unitario, custo_total, data, ordem_id, origem)
    VALUES (${Number(paId)}, ${Number(gramatura)}, ${q}, ${custoUnit}, ${q * custoUnit}, ${dataRef}, NULL, 'inventario')
    RETURNING *
  `
  await sql`
    INSERT INTO pa_movimentacoes
      (ordem_id, data, tipo, pa_id, gramatura, quantidade, custo_unitario, custo_total, descricao)
    VALUES (NULL, ${dataRef}, ${q < 0 ? TIPOS_MOV.SAIDA : TIPOS_MOV.AJUSTE}, ${Number(paId)}, ${Number(gramatura)},
            ${q}, ${custoUnit}, ${q * custoUnit}, ${descricao || 'Ajuste de inventário'})
  `
  return est[0]
}

// Estoque de PA agregado por produto + gramatura (custo médio ponderado).
export async function resumoPAEstoque() {
  const registros = await sql`SELECT pa_id, gramatura, quantidade, custo_total FROM pa_estoque`
  const pas = await sql`SELECT id, nome FROM pa_cadastro`
  const nomePorId = {}
  for (const p of pas) nomePorId[p.id] = p.nome

  const grupos = {}
  for (const r of registros) {
    const chave = `${r.pa_id}|${r.gramatura}`
    if (!grupos[chave]) {
      grupos[chave] = {
        paId: r.pa_id,
        paNome: nomePorId[r.pa_id] || `#${r.pa_id}`,
        gramatura: Number(r.gramatura),
        quantidade: 0,
        custoTotal: 0,
      }
    }
    grupos[chave].quantidade += Number(r.quantidade) || 0
    grupos[chave].custoTotal += Number(r.custo_total) || 0
  }

  return Object.values(grupos).map((g) => ({
    ...g,
    custoMedio: g.quantidade > 0 ? g.custoTotal / g.quantidade : 0,
    valorTotal: g.custoTotal,
  }))
}
