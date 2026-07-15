// GET /api/bling/produtos → lista produtos cadastrados no Bling.
// PUT /api/bling/produtos → atualiza o saldo de estoque de um produto no Bling.
//   Body: { codigoProduto, deposito, quantidade }
// (o endpoint /api/bling/estoque também faz a atualização de saldo)

import { blingFetch } from './auth.js'
import {
  respostaSucesso,
  respostaErro,
  enviarJson,
  aplicarCors,
  garantirMetodo,
  lerCorpo,
} from './_lib.js'

function mapearProduto(p) {
  const estoque = Number(p.estoque?.saldoVirtualTotal ?? p.saldoFisicoTotal ?? 0)
  return {
    id: p.id,
    codigo: p.codigo || '',
    nome: p.nome || '',
    preco: Number(p.preco || 0),
    estoque, // saldoVirtualTotal
    saldo: estoque, // compat: consumidores antigos
    unidade: p.unidade || '',
    situacao: p.situacao || '',
  }
}

async function listar(req, res) {
  const { pagina, codigo } = req.query || {}
  const params = new URLSearchParams()
  params.set('pagina', pagina || '1')
  params.set('limite', '100')
  if (codigo) params.set('codigo', codigo)

  const json = await blingFetch(`/produtos?${params.toString()}`)
  const lista = Array.isArray(json.data) ? json.data.map(mapearProduto) : []
  enviarJson(res, 200, respostaSucesso(lista))
}

// Descobre o id interno do produto a partir do código (o Bling exige id nos estoques).
async function idPorCodigo(codigoProduto) {
  const params = new URLSearchParams({ codigo: String(codigoProduto), limite: '1' })
  const json = await blingFetch(`/produtos?${params.toString()}`)
  const achado = Array.isArray(json.data) ? json.data[0] : null
  return achado?.id || null
}

async function atualizarEstoque(req, res) {
  const { codigoProduto, deposito, quantidade } = await lerCorpo(req)

  if (!codigoProduto || quantidade === undefined || quantidade === null) {
    return enviarJson(
      res,
      400,
      respostaErro('Informe codigoProduto e quantidade.'),
    )
  }

  const produtoId = await idPorCodigo(codigoProduto)
  if (!produtoId) {
    // Produto não encontrado → registra no log de erros
    console.error(`[bling] Produto não encontrado: código ${codigoProduto}`)
    return enviarJson(res, 404, respostaErro(`Produto ${codigoProduto} não encontrado no Bling.`))
  }

  // Lança um registro de estoque (balanço) para ajustar o saldo.
  const corpo = {
    produto: { id: produtoId },
    operacao: 'B', // Balanço
    quantidade: Number(quantidade),
    ...(deposito ? { deposito: { id: Number(deposito) } } : {}),
  }

  const json = await blingFetch('/estoques', {
    method: 'POST',
    body: JSON.stringify(corpo),
  })

  enviarJson(res, 200, respostaSucesso({ produtoId, codigoProduto, quantidade, retorno: json?.data ?? null }))
}

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, ['GET', 'PUT'])) return

  try {
    if (req.method === 'GET') return await listar(req, res)
    return await atualizarEstoque(req, res)
  } catch (e) {
    enviarJson(res, e.status === 401 ? 401 : 502, respostaErro(e.message))
  }
}
