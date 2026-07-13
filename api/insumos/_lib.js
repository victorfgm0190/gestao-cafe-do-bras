// Lógica de negócio compartilhada dos insumos.
// Arquivos começando com "_" NÃO viram rotas na Vercel.
//
// Custeio: custo médio ponderado corrido POR insumo (mesma fórmula do café cru,
// mas agrupado por insumo_id em vez de fazenda+variedade).

import { sql } from '../db.js'

export const TIPOS_MOV = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  AJUSTE: 'Ajuste',
  PERDA: 'Perda',
}

// Converte (tipo, quantidade, sentido) no delta com sinal aplicado ao saldo.
export function calcularDelta(tipo, quantidade, sentido) {
  const q = Math.abs(Number(String(quantidade).replace(',', '.'))) || 0
  if (tipo === TIPOS_MOV.SAIDA || tipo === TIPOS_MOV.PERDA) return -q
  if (tipo === TIPOS_MOV.AJUSTE) return sentido === 'positivo' ? q : -q
  return q // ENTRADA (default)
}

// Reprocessa o kardex de um insumo em ordem cronológica (data, id),
// recomputando saldo_acumulado / custo_medio / custo_unitario / custo_total.
// Devolve { saldoAtual, custoMedio }.
export async function recalcularInsumo(insumoId) {
  const movs = await sql`
    SELECT id, quantidade, custo_unitario
      FROM kardex_insumos
     WHERE insumo_id = ${insumoId}
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
      const novoSaldo = saldo + q
      custoMedio = novoSaldo > 0 ? (saldo * custoMedio + q * custoEntrada) / novoSaldo : 0
      saldo = novoSaldo
      custoUnit = custoEntrada
    } else {
      saldo = saldo + q
      custoUnit = custoMedio
    }

    const custoTotal = Math.abs(q) * custoUnit
    updates.push(sql`
      UPDATE kardex_insumos
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

// Resumo (saldo + custo médio) de cada insumo, a partir da última movimentação
// por insumo. Devolve um mapa { [insumoId]: { saldoAtual, custoMedio } }.
export async function resumoPorInsumo() {
  const linhas = await sql`
    SELECT DISTINCT ON (insumo_id)
           insumo_id, saldo_acumulado, custo_medio
      FROM kardex_insumos
     ORDER BY insumo_id, data DESC, id DESC
  `
  const mapa = {}
  for (const l of linhas) {
    mapa[l.insumo_id] = {
      saldoAtual: Number(l.saldo_acumulado) || 0,
      custoMedio: Number(l.custo_medio) || 0,
    }
  }
  return mapa
}
