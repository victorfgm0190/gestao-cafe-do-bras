// GET  /api/insumos/entradas            → lista as entradas (compras)
// POST /api/insumos/entradas            → registra entrada + lança ENTRADA no kardex
//
// Filtro opcional no GET: ?insumo_id=<id>

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../_http.js'
import { TIPOS_MOV, recalcularInsumo } from './_lib.js'

const num = (v) => Number(String(v ?? '').replace(',', '.')) || 0

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, ['GET', 'POST'])) return

  try {
    if (req.method === 'GET') {
      const { insumo_id } = req.query
      const entradas =
        insumo_id !== undefined
          ? await sql`SELECT * FROM insumos_entradas WHERE insumo_id = ${Number(insumo_id)} ORDER BY data ASC, id ASC`
          : await sql`SELECT * FROM insumos_entradas ORDER BY data ASC, id ASC`
      return enviarJson(res, 200, { entradas })
    }

    const b = await lerCorpo(req)
    const insumoId = Number(b.insumoId ?? b.insumo_id)
    if (!Number.isFinite(insumoId)) return enviarErro(res, 400, 'insumoId inválido.')
    const quantidade = num(b.quantidade)
    const custoUnitario = num(b.custoUnitario)
    const data = b.data || new Date().toISOString().slice(0, 10)
    const fornecedor = (b.fornecedor || '').trim()
    const observacao = (b.observacao || '').trim()

    // (a) grava a entrada
    const inseridas = await sql`
      INSERT INTO insumos_entradas (insumo_id, data, quantidade, custo_unitario, fornecedor, observacao)
      VALUES (${insumoId}, ${data}, ${quantidade}, ${custoUnitario}, ${fornecedor}, ${observacao})
      RETURNING *
    `
    const entrada = inseridas[0]

    // (b) lança a ENTRADA no kardex
    const descricao =
      (fornecedor ? `Entrada — ${fornecedor}` : 'Entrada') + (observacao ? ` (${observacao})` : '')
    await sql`
      INSERT INTO kardex_insumos
        (insumo_id, data, tipo, descricao, quantidade, custo_unitario, custo_total, saldo_acumulado, custo_medio)
      VALUES
        (${insumoId}, ${data}, ${TIPOS_MOV.ENTRADA}, ${descricao}, ${quantidade}, ${custoUnitario}, 0, 0, 0)
    `

    const resumo = await recalcularInsumo(insumoId)
    return enviarJson(res, 201, { entrada, resumo })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao processar entradas: ${erro?.message || erro}`)
  }
}
