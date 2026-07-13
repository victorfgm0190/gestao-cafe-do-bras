// POST /api/pa/ajuste → ajuste avulso de estoque de PA (usado pelo inventário:
// sobra ou saída não identificada). quantidade positiva = entrada; negativa = saída.
// Corpo: { paId, gramatura, quantidade, descricao, data }

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../_http.js'
import { TIPOS_MOV, resumoPAEstoque } from './_lib.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'POST')) return

  try {
    const b = await lerCorpo(req)
    const paId = Number(b.paId)
    const gramatura = Number(b.gramatura)
    const q = Number(String(b.quantidade ?? '').replace(',', '.')) || 0
    const data = b.data || new Date().toISOString().slice(0, 10)

    const resumo = await resumoPAEstoque()
    const atual = resumo.find((r) => r.paId === paId && Number(r.gramatura) === gramatura)
    const custoUnit = atual ? Number(atual.custoMedio) || 0 : 0

    const est = await sql`
      INSERT INTO pa_estoque (pa_id, gramatura, quantidade, custo_unitario, custo_total, data, ordem_id, origem)
      VALUES (${paId}, ${gramatura}, ${q}, ${custoUnit}, ${q * custoUnit}, ${data}, NULL, 'inventario')
      RETURNING *
    `
    await sql`
      INSERT INTO pa_movimentacoes
        (ordem_id, data, tipo, pa_id, gramatura, quantidade, custo_unitario, custo_total, descricao)
      VALUES (NULL, ${data}, ${q < 0 ? TIPOS_MOV.SAIDA : TIPOS_MOV.AJUSTE}, ${paId}, ${gramatura},
              ${q}, ${custoUnit}, ${q * custoUnit}, ${b.descricao || 'Ajuste de inventário'})
    `
    return enviarJson(res, 201, { registro: est[0] })
  } catch (erro) {
    return enviarErro(res, 500, `Falha no ajuste de estoque de PA: ${erro?.message || erro}`)
  }
}
