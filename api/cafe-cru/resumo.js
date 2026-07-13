// GET /api/cafe-cru/resumo
// Resumo do estoque de café cru, autoritativo (calculado no banco):
//   { total: { saldoAtual, custoMedio }, grupos: [{ chave, produtor, variedade,
//     saldoAtual, custoMedio, valorTotal }] }
//
// O estado corrente de cada grupo é a ÚLTIMA movimentação (por data, id): os
// campos saldo_acumulado e custo_medio já vêm corridos por grupo.

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo } from '../_http.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'GET')) return

  try {
    const linhas = await sql`
      SELECT DISTINCT ON (grupo)
             grupo, produtor, variedade, saldo_acumulado, custo_medio
        FROM kardex_cafe_cru
       ORDER BY grupo, data DESC, id DESC
    `

    let saldoTotal = 0
    let valorTotal = 0
    const grupos = []
    for (const l of linhas) {
      const saldoAtual = Number(l.saldo_acumulado) || 0
      const custoMedio = Number(l.custo_medio) || 0
      const valor = saldoAtual * custoMedio
      saldoTotal += saldoAtual
      valorTotal += valor
      if (saldoAtual > 1e-9 || valor > 1e-9) {
        grupos.push({
          chave: l.grupo,
          produtor: l.produtor || '',
          variedade: l.variedade || '',
          saldoAtual,
          custoMedio,
          valorTotal: valor,
        })
      }
    }

    grupos.sort(
      (a, b) =>
        (a.produtor || '').localeCompare(b.produtor || '') ||
        (a.variedade || '').localeCompare(b.variedade || ''),
    )

    return enviarJson(res, 200, {
      total: { saldoAtual: saldoTotal, custoMedio: saldoTotal > 0 ? valorTotal / saldoTotal : 0 },
      grupos,
    })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao carregar o resumo: ${erro?.message || erro}`)
  }
}
