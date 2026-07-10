// GET /api/bling/contas-receber → lista contas a receber do Bling.
// Parâmetros: dataVencimentoInicial, dataVencimentoFinal, situacao

import { blingFetch } from './auth.js'
import { respostaSucesso, respostaErro, enviarJson, aplicarCors, garantirMetodo } from './_lib.js'

function mapearConta(c) {
  return {
    id: c.id,
    cliente: c.contato?.nome || '',
    vencimento: c.vencimento || c.dataVencimento || '',
    valor: Number(c.valor || 0),
    situacao: c.situacao ?? null,
    historico: c.historico || '',
    documento: c.numeroDocumento || '',
  }
}

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'GET')) return

  try {
    const { dataVencimentoInicial, dataVencimentoFinal, situacao, pagina } = req.query || {}
    const params = new URLSearchParams()
    if (dataVencimentoInicial) params.set('dataVencimentoInicial', dataVencimentoInicial)
    if (dataVencimentoFinal) params.set('dataVencimentoFinal', dataVencimentoFinal)
    if (situacao) params.set('situacoes[]', situacao)
    params.set('pagina', pagina || '1')
    params.set('limite', '100')

    const json = await blingFetch(`/contas/receber?${params.toString()}`)
    const lista = Array.isArray(json.data) ? json.data.map(mapearConta) : []

    enviarJson(res, 200, respostaSucesso(lista))
  } catch (e) {
    enviarJson(res, e.status === 401 ? 401 : 502, respostaErro(e.message))
  }
}
