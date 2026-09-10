// GET /api/insumos/resumo
// Mapa { [insumoId]: { saldoAtual, custoMedio } } derivado do kardex (autoritativo).

import { aplicarCors, enviarJson, enviarErro, garantirMetodo } from '../_http.js'
import { resumoPorInsumo } from './_lib.js'
import { exigirPermissao } from '../_auth.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'GET')) return
  const autorizado = await exigirPermissao(req, res, 'Insumos')
  if (!autorizado) return

  try {
    const resumo = await resumoPorInsumo()
    return enviarJson(res, 200, { resumo })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao carregar o resumo: ${erro?.message || erro}`)
  }
}
