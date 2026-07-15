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

// Normaliza cafe_origem_ids para um array de grupos { fazenda, variedade }.
// Aceita array de objetos; descarta entradas sem os dois campos. Devolve null se
// a entrada não for um array (sinaliza "não mexer" no PUT).
export function normalizarCafeOrigem(valor) {
  if (!Array.isArray(valor)) return null
  return valor
    .map((o) => ({
      fazenda: String(o?.fazenda ?? '').trim(),
      variedade: String(o?.variedade ?? '').trim(),
    }))
    .filter((o) => o.fazenda && o.variedade)
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

  // Preserva a gramatura como identificador (número ou 'drip'); o peso vem de pesoGramas().
  const itensBrutos = (input.itens || [])
    .map((it) => ({ gramatura: it.gramatura, quantidade: Number(it.quantidade) || 0 }))
    .filter((it) => pesoGramas(it.gramatura) > 0 && it.quantidade > 0)

  const totalKgEmbalado = itensBrutos.reduce((s, it) => s + (it.quantidade * pesoGramas(it.gramatura)) / 1000, 0)
  const custoKgEmbalado = totalKgEmbalado > 0 ? custoTotalCru / totalKgEmbalado : 0

  const itens = itensBrutos.map((it) => {
    const gramaturaKg = pesoGramas(it.gramatura) / 1000
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
  // A coluna gramatura é TEXT: gravamos/comparamos pelo rótulo ("250g", "Drip (10g)").
  const rotulo = formatarGramatura(gramatura)
  const resumo = await resumoPAEstoque()
  const atual = resumo.find((r) => r.paId === Number(paId) && formatarGramatura(r.gramatura) === rotulo)
  const custoUnit = atual ? Number(atual.custoMedio) || 0 : 0

  const est = await sql`
    INSERT INTO pa_estoque (pa_id, gramatura, quantidade, custo_unitario, custo_total, data, ordem_id, origem)
    VALUES (${Number(paId)}, ${rotulo}, ${q}, ${custoUnit}, ${q * custoUnit}, ${dataRef}, NULL, 'inventario')
    RETURNING *
  `
  await sql`
    INSERT INTO pa_movimentacoes
      (ordem_id, data, tipo, pa_id, gramatura, quantidade, custo_unitario, custo_total, descricao)
    VALUES (NULL, ${dataRef}, ${q < 0 ? TIPOS_MOV.SAIDA : TIPOS_MOV.AJUSTE}, ${Number(paId)}, ${rotulo},
            ${q}, ${custoUnit}, ${q * custoUnit}, ${descricao || 'Ajuste de inventário'})
  `
  return est[0]
}

// Peso (kg) por gramatura do mix de projeção.
const PESO_KG_MIX = { 200: 0.2, 250: 0.25, 1000: 1, drip: 0.01 }

// Normaliza uma gramatura (rótulo "250g"/"1kg"/"Drip (10g)", número ou 'drip')
// para a chave usada no mix ('200' | '250' | '1000' | 'drip').
function chaveMix(gramatura) {
  const g = pesoGramas(gramatura)
  if (g === 10) return 'drip'
  if (g === 200) return '200'
  if (g === 250) return '250'
  if (g === 1000) return '1000'
  return null
}

// Estoque projetado por produto: a partir do café cru vinculado (ou todo o
// disponível), estima quantos pacotes de cada gramatura o mix produziria e soma
// ao estoque real. A sobra de kg após o floor de cada gramatura é consolidada na
// gramatura de maior peso presente no mix (tipicamente 1kg).
export async function resumoProjecaoPA() {
  // Garante as colunas do mix (migração idempotente) — a tela de projeção pode
  // ser o primeiro endpoint acessado após um deploy novo.
  await sql`ALTER TABLE pa_cadastro ADD COLUMN IF NOT EXISTS mix_projecao jsonb`
  await sql`ALTER TABLE pa_cadastro ADD COLUMN IF NOT EXISTS cafe_origem_ids jsonb`

  const pas = await sql`
    SELECT id, nome, mix_projecao, cafe_origem_ids, perda_torra_padrao
      FROM pa_cadastro
     WHERE mix_projecao IS NOT NULL
     ORDER BY nome ASC
  `
  if (!pas.length) return []

  const lotes = await sql`
    SELECT fazenda, variedade, saldo_disponivel FROM lotes_cafe_cru WHERE saldo_disponivel > 0
  `
  const saldoTotalDisponivel = lotes.reduce((s, l) => s + (Number(l.saldo_disponivel) || 0), 0)
  // Saldo disponível somado por grupo (fazenda + variedade).
  const saldoPorGrupo = {}
  for (const l of lotes) {
    const chave = chaveGrupo(l.fazenda, l.variedade)
    saldoPorGrupo[chave] = (saldoPorGrupo[chave] || 0) + (Number(l.saldo_disponivel) || 0)
  }

  // Estoque real agregado por pa_id → { chaveMix: quantidade }.
  const estoque = await resumoPAEstoque()
  const realPorPa = {}
  for (const e of estoque) {
    const chave = chaveMix(e.gramatura)
    if (!chave) continue
    if (!realPorPa[e.paId]) realPorPa[e.paId] = {}
    realPorPa[e.paId][chave] = (realPorPa[e.paId][chave] || 0) + (Number(e.quantidade) || 0)
  }

  return pas.map((pa) => {
    const mix = pa.mix_projecao && typeof pa.mix_projecao === 'object' ? pa.mix_projecao : {}
    // cafe_origem_ids: array de grupos { fazenda, variedade } vinculados ao produto.
    const origens = Array.isArray(pa.cafe_origem_ids) ? pa.cafe_origem_ids : []
    const perda = Number(pa.perda_torra_padrao) || 0

    // Café cru vinculado (grupos em cafe_origem_ids) ou, sem vínculo, todo o disponível.
    const kgCru = origens.length
      ? origens.reduce((s, o) => s + (saldoPorGrupo[chaveGrupo(o?.fazenda, o?.variedade)] || 0), 0)
      : saldoTotalDisponivel
    const kgTorrado = kgCru * (1 - perda / 100)

    // Gramaturas do mix com percentual > 0.
    const chavesMix = ['200', '250', '1000', 'drip'].filter((k) => (Number(mix[k]) || 0) > 0)
    // Alvo da sobra: maior peso entre as gramaturas do mix.
    const alvoSobra = chavesMix.reduce(
      (melhor, k) => (melhor === null || PESO_KG_MIX[k] > PESO_KG_MIX[melhor] ? k : melhor),
      null,
    )

    // 1ª passada: gramaturas que NÃO recebem a sobra.
    const projetado = {}
    let sobraKg = 0
    for (const k of chavesMix) {
      if (k === alvoSobra) continue
      const kgGramatura = kgTorrado * ((Number(mix[k]) || 0) / 100)
      const pacotes = Math.floor(kgGramatura / PESO_KG_MIX[k])
      projetado[k] = pacotes
      sobraKg += kgGramatura - pacotes * PESO_KG_MIX[k]
    }
    // 2ª passada: gramatura de maior peso recebe sua fração + toda a sobra.
    if (alvoSobra) {
      const kgAlvo = kgTorrado * ((Number(mix[alvoSobra]) || 0) / 100) + sobraKg
      projetado[alvoSobra] = Math.floor(kgAlvo / PESO_KG_MIX[alvoSobra])
    }

    // Une gramaturas do mix e do estoque real para montar os mapas de saída.
    const real = realPorPa[pa.id] || {}
    const chaves = [...new Set([...chavesMix, ...Object.keys(real)])]
    const estoqueReal = {}
    const projetadoAdicional = {}
    const estoqueProjetado = {}
    for (const k of chaves) {
      const r = real[k] || 0
      const p = projetado[k] || 0
      estoqueReal[k] = r
      projetadoAdicional[k] = p
      estoqueProjetado[k] = r + p
    }

    return {
      pa_id: pa.id,
      nome: pa.nome,
      estoque_real: estoqueReal,
      projetado_adicional: projetadoAdicional,
      estoque_projetado: estoqueProjetado,
      kg_cru_disponivel: kgCru,
      kg_torrado_disponivel: kgTorrado,
    }
  })
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
        gramatura: r.gramatura, // rótulo em texto ("250g", "Drip (10g)"); use pesoGramas p/ cálculo
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
