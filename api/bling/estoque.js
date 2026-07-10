// PUT /api/bling/estoque → atualiza o saldo de estoque de um produto no Bling.
// Body: { codigoProduto, deposito, quantidade }

import { blingFetch } from './auth.js'
import {
  respostaSucesso,
  respostaErro,
  enviarJson,
  aplicarCors,
  garantirMetodo,
  lerCorpo,
} from './_lib.js'

async function idPorCodigo(codigoProduto) {
  const params = new URLSearchParams({ codigo: String(codigoProduto), limite: '1' })
  const json = await blingFetch(`/produtos?${params.toString()}`)
  const achado = Array.isArray(json.data) ? json.data[0] : null
  return achado?.id || null
}

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, ['PUT', 'POST'])) return

  try {
    const { codigoProduto, deposito, quantidade } = await lerCorpo(req)

    if (!codigoProduto || quantidade === undefined || quantidade === null) {
      return enviarJson(res, 400, respostaErro('Informe codigoProduto e quantidade.'))
    }

    const produtoId = await idPorCodigo(codigoProduto)
    if (!produtoId) {
      console.error(`[bling] Produto não encontrado: código ${codigoProduto}`)
      return enviarJson(res, 404, respostaErro(`Produto ${codigoProduto} não encontrado no Bling.`))
    }

    const corpo = {
      produto: { id: produtoId },
      operacao: 'B', // Balanço de estoque
      quantidade: Number(quantidade),
      ...(deposito ? { deposito: { id: Number(deposito) } } : {}),
    }

    const json = await blingFetch('/estoques', {
      method: 'POST',
      body: JSON.stringify(corpo),
    })

    enviarJson(
      res,
      200,
      respostaSucesso({ produtoId, codigoProduto, quantidade, retorno: json?.data ?? null }),
    )
  } catch (e) {
    enviarJson(res, e.status === 401 ? 401 : 502, respostaErro(e.message))
  }
}
