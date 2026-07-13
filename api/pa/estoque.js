// GET /api/pa/estoque → estoque de PA agregado por produto + gramatura
// (array de { paId, paNome, gramatura, quantidade, custoMedio, custoTotal, valorTotal })

import { aplicarCors, enviarJson, enviarErro, garantirMetodo } from '../_http.js'
import { resumoPAEstoque } from './_lib.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'GET')) return
  try {
    const estoque = await resumoPAEstoque()
    return enviarJson(res, 200, { estoque })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao carregar o estoque de PA: ${erro?.message || erro}`)
  }
}
