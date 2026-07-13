// Lógica de negócio do café torrado (PP).
// Arquivos começando com "_" NÃO viram rotas na Vercel.
//
// O torrado não é comprado: cada torra baixa café cru e gera torrado. O custo
// médio é um fluxo ÚNICO (não agrupado), corrido sobre kardex_cafe_torrado.

import { sql } from '../db.js'

export const TIPOS_MOV = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  AJUSTE: 'Ajuste',
  PERDA: 'Perda',
}

export function calcularDelta(tipo, quantidade, sentido) {
  const q = Math.abs(Number(String(quantidade).replace(',', '.'))) || 0
  if (tipo === TIPOS_MOV.SAIDA || tipo === TIPOS_MOV.PERDA) return -q
  if (tipo === TIPOS_MOV.AJUSTE) return sentido === 'positivo' ? q : -q
  return q
}

// Reprocessa TODO o kardex do torrado (fluxo único) recomputando saldo/custo médio.
export async function recalcularTorrado() {
  const movs = await sql`
    SELECT id, quantidade, custo_unitario
      FROM kardex_cafe_torrado
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
      UPDATE kardex_cafe_torrado
         SET saldo_acumulado = ${saldo}, custo_medio = ${custoMedio},
             custo_unitario = ${custoUnit}, custo_total = ${custoTotal}
       WHERE id = ${m.id}
    `)
  }

  if (updates.length) await sql.transaction(updates)
  return { saldoAtual: saldo, custoMedio }
}

// Resumo (saldo + custo médio) do torrado = última movimentação.
export async function resumoTorrado() {
  const linhas = await sql`
    SELECT saldo_acumulado, custo_medio FROM kardex_cafe_torrado
     ORDER BY data DESC, id DESC LIMIT 1
  `
  return {
    saldoAtual: Number(linhas[0]?.saldo_acumulado) || 0,
    custoMedio: Number(linhas[0]?.custo_medio) || 0,
  }
}

// Formata data ISO (YYYY-MM-DD) como DD/MM/AAAA (para descrições de torra).
export function formatarDataBR(iso) {
  const s = String(iso || '').slice(0, 10)
  const [a, m, d] = s.split('-')
  return a && m && d ? `${d}/${m}/${a}` : s
}
