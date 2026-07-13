// POST /api/torrado/movimentacao → registra movimentação no kardex do torrado
// Usada por ajustes de inventário e pela "sobra" da Ordem de Produção.
// Corpo: { tipo, descricao, quantidade, custoUnitario, data, sentido }

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../_http.js'
import { TIPOS_MOV, calcularDelta, recalcularTorrado } from './_lib.js'

const num = (v) => Number(String(v ?? '').replace(',', '.')) || 0

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'POST')) return
  try {
    const b = await lerCorpo(req)
    const tipo = b.tipo
    if (!Object.values(TIPOS_MOV).includes(tipo)) {
      return enviarErro(res, 400, `tipo inválido. Use: ${Object.values(TIPOS_MOV).join(', ')}.`)
    }
    const delta = calcularDelta(tipo, b.quantidade, b.sentido)
    if (delta === 0) return enviarErro(res, 400, 'quantidade deve ser maior que zero.')

    const custoInformado = delta > 0 ? num(b.custoUnitario) : 0
    const data = b.data || new Date().toISOString().slice(0, 10)

    const inseridos = await sql`
      INSERT INTO kardex_cafe_torrado
        (data, tipo, descricao, quantidade, custo_unitario, custo_total, saldo_acumulado, custo_medio)
      VALUES (${data}, ${tipo}, ${b.descricao || ''}, ${delta}, ${custoInformado}, 0, 0, 0)
      RETURNING id
    `
    const resumo = await recalcularTorrado()
    const linhas = await sql`SELECT * FROM kardex_cafe_torrado WHERE id = ${inseridos[0].id} LIMIT 1`
    return enviarJson(res, 201, { movimentacao: linhas[0], resumo })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao registrar a movimentação: ${erro?.message || erro}`)
  }
}
