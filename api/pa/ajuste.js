// POST /api/pa/ajuste → ajuste avulso de estoque de PA (usado pelo inventário).
// Corpo: { paId, gramatura, quantidade, descricao, data }

import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../_http.js'
import { ajustarEstoquePA } from './_lib.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'POST')) return
  try {
    const b = await lerCorpo(req)
    const registro = await ajustarEstoquePA(b)
    return enviarJson(res, 201, { registro })
  } catch (erro) {
    return enviarErro(res, 500, `Falha no ajuste de estoque de PA: ${erro?.message || erro}`)
  }
}
