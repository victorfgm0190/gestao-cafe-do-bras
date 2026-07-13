// GET /api/torrado/resumo → { saldoAtual, custoMedio, ultimaAtualizacao }

import { aplicarCors, enviarJson, enviarErro, garantirMetodo } from '../_http.js'
import { resumoTorrado } from './_lib.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'GET')) return
  try {
    const r = await resumoTorrado()
    return enviarJson(res, 200, { ...r, ultimaAtualizacao: null })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao carregar o resumo: ${erro?.message || erro}`)
  }
}
