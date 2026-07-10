// GET /api/bling/contatos → lista clientes e fornecedores do Bling.
// Parâmetros: tipo (cliente | fornecedor), pagina

import { blingFetch } from './auth.js'
import { respostaSucesso, respostaErro, enviarJson, aplicarCors, garantirMetodo } from './_lib.js'

// No Bling v3 o tipo de relação vem em contato.tipos[].
function ehTipo(contato, tipo) {
  if (!tipo) return true
  const tipos = Array.isArray(contato.tipos) ? contato.tipos : []
  const alvo = tipo === 'cliente' ? 'Cliente' : 'Fornecedor'
  return tipos.some((t) => (t?.descricao || '').toLowerCase() === alvo.toLowerCase())
}

function mapearContato(c) {
  return {
    id: c.id,
    nome: c.nome || '',
    documento: c.numeroDocumento || '',
    email: c.email || '',
    telefone: c.telefone || c.celular || '',
    tipos: Array.isArray(c.tipos) ? c.tipos.map((t) => t.descricao) : [],
  }
}

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'GET')) return

  try {
    const { tipo, pagina } = req.query || {}
    const params = new URLSearchParams()
    params.set('pagina', pagina || '1')
    params.set('limite', '100')

    const json = await blingFetch(`/contatos?${params.toString()}`)
    let lista = Array.isArray(json.data) ? json.data.map(mapearContato) : []

    // Filtro por tipo aplicado sobre o retorno mapeado.
    if (tipo) {
      const bruto = Array.isArray(json.data) ? json.data : []
      lista = bruto.filter((c) => ehTipo(c, tipo)).map(mapearContato)
    }

    enviarJson(res, 200, respostaSucesso(lista))
  } catch (e) {
    enviarJson(res, e.status === 401 ? 401 : 502, respostaErro(e.message))
  }
}
