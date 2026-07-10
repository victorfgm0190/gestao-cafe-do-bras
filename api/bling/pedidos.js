// GET /api/bling/pedidos → busca pedidos de venda do Bling.
// Parâmetros de query: dataInicial, dataFinal, pagina
// Retorna os pedidos mapeados para o nosso padrão.

import { blingFetch } from './auth.js'
import { respostaSucesso, respostaErro, enviarJson, aplicarCors, garantirMetodo } from './_lib.js'

// Mapeia um pedido de venda do Bling para o formato do nosso sistema.
function mapearPedido(p) {
  return {
    id: p.id,
    numero: p.numero,
    data: p.data,
    cliente: p.contato?.nome || '',
    clienteId: p.contato?.id || null,
    valor: Number(p.total ?? p.totalProdutos ?? 0),
    status: p.situacao?.valor ?? p.situacao?.id ?? null,
    itens: Array.isArray(p.itens)
      ? p.itens.map((it) => ({
          codigo: it.codigo || '',
          descricao: it.descricao || '',
          quantidade: Number(it.quantidade || 0),
          valor: Number(it.valor || 0),
        }))
      : [],
  }
}

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'GET')) return

  try {
    const { dataInicial, dataFinal, pagina } = req.query || {}
    const params = new URLSearchParams()
    if (dataInicial) params.set('dataInicial', dataInicial)
    if (dataFinal) params.set('dataFinal', dataFinal)
    params.set('pagina', pagina || '1')
    params.set('limite', '100')

    const json = await blingFetch(`/pedidos/vendas?${params.toString()}`)
    const lista = Array.isArray(json.data) ? json.data.map(mapearPedido) : []

    enviarJson(res, 200, respostaSucesso(lista))
  } catch (e) {
    enviarJson(res, e.status === 401 ? 401 : 502, respostaErro(e.message))
  }
}
