// Lógica de negócio compartilhada do café cru (MP).
// Arquivos começando com "_" NÃO viram rotas na Vercel.
//
// Regra de custeio (espelha src/utils/kardex.js): custo médio ponderado ISOLADO
// por grupo (fazenda + variedade). Entradas recalculam o médio do grupo; saídas/
// perdas/ajustes negativos reduzem o saldo e são valorizados pelo médio VIGENTE.

import { sql } from '../db.js'

export const TIPOS_MOV = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  AJUSTE: 'Ajuste',
  PERDA: 'Perda',
}

// Chave do grupo de custeio: fazenda (produtor) + variedade.
export function chaveGrupo(produtor, variedade) {
  return `${(produtor || '').trim()}|${(variedade || '').trim()}`
}

// Converte (tipo, quantidade, sentido) no delta com sinal aplicado ao saldo.
export function calcularDelta(tipo, quantidade, sentido) {
  const q = Math.abs(Number(String(quantidade).replace(',', '.'))) || 0
  if (tipo === TIPOS_MOV.SAIDA || tipo === TIPOS_MOV.PERDA) return -q
  if (tipo === TIPOS_MOV.AJUSTE) return sentido === 'positivo' ? q : -q
  return q // ENTRADA (default)
}

// Reprocessa TODO o kardex de um grupo em ordem cronológica (data, id),
// recomputando saldo_acumulado / custo_medio / custo_unitario / custo_total.
// Persiste os UPDATEs numa transação atômica. Devolve { saldoAtual, custoMedio }.
export async function recalcularGrupo(grupo) {
  const movs = await sql`
    SELECT id, quantidade, custo_unitario
      FROM kardex_cafe_cru
     WHERE grupo = ${grupo}
     ORDER BY data ASC, id ASC
  `

  let saldo = 0
  let custoMedio = 0
  const updates = []

  for (const m of movs) {
    const q = Number(m.quantidade) || 0
    const custoEntrada = Number(m.custo_unitario) || 0
    let custoUnit

    if (q > 0 && custoEntrada > 0) {
      // Entrada: recalcula o custo médio ponderado do grupo.
      const novoSaldo = saldo + q
      custoMedio = novoSaldo > 0 ? (saldo * custoMedio + q * custoEntrada) / novoSaldo : 0
      saldo = novoSaldo
      custoUnit = custoEntrada
    } else {
      // Saída/perda/ajuste: saldo diminui; custo médio do grupo NÃO muda.
      saldo = saldo + q
      custoUnit = custoMedio
    }

    const custoTotal = Math.abs(q) * custoUnit
    updates.push(sql`
      UPDATE kardex_cafe_cru
         SET saldo_acumulado = ${saldo},
             custo_medio = ${custoMedio},
             custo_unitario = ${custoUnit},
             custo_total = ${custoTotal}
       WHERE id = ${m.id}
    `)
  }

  if (updates.length) await sql.transaction(updates)
  return { saldoAtual: saldo, custoMedio }
}

// Custo médio ponderado ATUAL de um grupo (custo_medio da última movimentação
// por data/id). Devolve 0 se o grupo não tem movimentações.
export async function custoMedioAtualGrupo(grupo) {
  const linhas = await sql`
    SELECT custo_medio FROM kardex_cafe_cru
     WHERE grupo = ${grupo}
     ORDER BY data DESC, id DESC
     LIMIT 1
  `
  return Number(linhas[0]?.custo_medio) || 0
}

// Snapshot { id → custo_total } das movimentações de um conjunto de grupos,
// para comparar o impacto (antes/depois) de uma edição em cascata.
export async function snapshotCustos(grupos) {
  const lista = [...new Set(grupos.filter(Boolean))]
  if (!lista.length) return {}
  const linhas = await sql`
    SELECT id, tipo, data, descricao, custo_total
      FROM kardex_cafe_cru
     WHERE grupo = ANY(${lista})
  `
  const mapa = {}
  for (const l of linhas) mapa[l.id] = l
  return mapa
}

// Gera o próximo código de lote no formato LC-AAAA-NNN, sequencial POR ANO.
export async function proximoCodigoLote(dataEntrada) {
  const ano = String(dataEntrada || '').slice(0, 4) || String(new Date().getFullYear())
  const prefixo = `LC-${ano}-`
  const linhas = await sql`
    SELECT codigo_lote FROM lotes_cafe_cru
     WHERE codigo_lote LIKE ${prefixo + '%'}
  `
  let maior = 0
  for (const l of linhas) {
    const n = parseInt(String(l.codigo_lote).slice(prefixo.length), 10)
    if (Number.isFinite(n) && n > maior) maior = n
  }
  return `${prefixo}${String(maior + 1).padStart(3, '0')}`
}
