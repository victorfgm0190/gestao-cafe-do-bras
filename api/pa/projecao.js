// GET /api/pa/projecao → estoque projetado por produto (PAs com mix_projecao).
// Cada item: { pa_id, nome, estoque_real, projetado_adicional, estoque_projetado,
//              kg_cru_disponivel, kg_torrado_disponivel }
// Os mapas usam as chaves do mix: '200' | '250' | '1000' | 'drip'.

import { aplicarCors, enviarJson, enviarErro, garantirMetodo } from '../_http.js'
import { resumoProjecaoPA } from './_lib.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'GET')) return
  try {
    const projecao = await resumoProjecaoPA()
    return enviarJson(res, 200, { projecao })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao calcular o estoque projetado: ${erro?.message || erro}`)
  }
}
