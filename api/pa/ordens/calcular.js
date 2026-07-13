// POST /api/pa/ordens/calcular → prévia dos custos de uma ordem (sem persistir)
// Corpo: { paId, itens:[{gramatura, quantidade}], lotes:[{loteId, kg}], sobra }

import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../../_http.js'
import { calcularOrdem } from '../_lib.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'POST')) return
  try {
    const b = await lerCorpo(req)
    const calc = await calcularOrdem(b)
    return enviarJson(res, 200, { calc })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao calcular a ordem: ${erro?.message || erro}`)
  }
}
