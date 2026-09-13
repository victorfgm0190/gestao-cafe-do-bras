// GET  /api/bling/sync/mapa → diagnóstico: mostra o que casaria, sem gravar
// POST /api/bling/sync/mapa → grava o mapa (produto_id, gramatura) → variação
//
// No Bling cada gramatura é uma variação com id próprio; guardávamos só o id do
// produto PAI (pa_cadastro.bling_id). Sem este mapa, push, pull e divergências
// não conseguem falar de "250g do Bourbon".
//
// O GET existe porque o nome da variação é o único elo com a gramatura: rode
// ele primeiro e confira a lista `naoReconhecidas` antes de gravar.

import { sql, transacao } from '../../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo } from '../../_http.js'
import { exigirPermissao } from '../../_auth.js'
import {
  buscarProdutosBling,
  carregarMapa,
  ehVariacao,
  garantirEstrutura,
  gramaturaDeTexto,
  nomePai,
  saldoBlingDe,
} from './_lib.js'

const MODULO = 'Estoque PA'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, ['GET', 'POST'])) return
  const autorizado = await exigirPermissao(req, res, MODULO, req.method === 'POST' ? 'editar' : 'visualizar')
  if (!autorizado) return

  try {
    await garantirEstrutura()

    // ?gravado=1 → devolve o mapa já gravado, sem chamar o Bling.
    if (req.method === 'GET' && req.query?.gravado) {
      const mapa = await carregarMapa()
      return enviarJson(res, 200, { mapa, total: mapa.length })
    }

    const analise = await analisar()
    if (req.method === 'GET') {
      return enviarJson(res, 200, { ...analise, gravado: false })
    }

    if (analise.conflitos.length > 0) {
      return enviarErro(
        res,
        409,
        `Duas variações disputam a mesma gramatura (${analise.conflitos
          .map((c) => `${c.paNome} ${c.gramatura}`)
          .join(', ')}). Ajuste os nomes no Bling e rode de novo.`,
      )
    }

    if (analise.mapeadas.length === 0) {
      return enviarErro(res, 422, 'Nenhuma variação pôde ser casada com o catálogo de PA.')
    }

    await transacao(
      analise.mapeadas.map(
        (m) => sql`
          INSERT INTO bling_sync_status
            (produto_id, gramatura, bling_variacao_id, bling_codigo, saldo_bling, atualizado_em)
          VALUES (${m.paId}, ${m.gramatura}, ${m.variacaoId}, ${m.codigo}, ${m.saldoBling}, NOW())
          ON CONFLICT (produto_id, gramatura) DO UPDATE
             SET bling_variacao_id = EXCLUDED.bling_variacao_id,
                 bling_codigo = EXCLUDED.bling_codigo,
                 saldo_bling = EXCLUDED.saldo_bling,
                 atualizado_em = NOW()
        `,
      ),
    )

    return enviarJson(res, 200, { ...analise, gravado: true })
  } catch (erro) {
    const status = erro?.status === 401 ? 401 : 502
    return enviarErro(res, status, `Falha ao montar o mapa de variações: ${erro?.message || erro}`)
  }
}

async function analisar() {
  const produtos = await buscarProdutosBling()
  const variacoes = produtos.filter(ehVariacao)
  const pais = produtos.filter((p) => !ehVariacao(p))

  // pa_cadastro guarda o bling_id do PAI (gravado por importar-produtos-pa).
  const cadastro = await sql`SELECT id, nome, bling_id FROM pa_cadastro WHERE ativo = true`
  const paPorBlingId = new Map(cadastro.filter((p) => p.bling_id).map((p) => [String(p.bling_id), p]))
  const paPorNome = new Map(cadastro.map((p) => [String(p.nome).trim().toLowerCase(), p]))
  const paiPorNome = new Map(pais.map((p) => [String(p.nome).trim().toLowerCase(), p]))

  const mapeadas = []
  const naoReconhecidas = []
  const semProdutoLocal = []
  const vistos = new Map() // "paId|gramatura" → variação já casada
  const conflitos = []

  for (const v of variacoes) {
    const gramatura = gramaturaDeTexto(v.nome) || gramaturaDeTexto(v.codigo)
    const nome = String(v.nome || '')

    if (!gramatura) {
      naoReconhecidas.push({ id: v.id, nome, codigo: v.codigo || '' })
      continue
    }

    // O pai vem no próprio objeto em algumas respostas; quando não vem, casamos
    // pelo nome (o sufixo "Grão: ..." é o que separa variação de pai).
    const idPai = v.produtoPai?.id ?? v.variacao?.produtoPai?.id ?? null
    const pai = idPai ? null : paiPorNome.get(nomePai(nome).toLowerCase())
    const pa =
      (idPai && paPorBlingId.get(String(idPai))) ||
      (pai && paPorBlingId.get(String(pai.id))) ||
      paPorNome.get(nomePai(nome).toLowerCase()) ||
      null

    if (!pa) {
      semProdutoLocal.push({ id: v.id, nome, gramatura })
      continue
    }

    const chave = `${pa.id}|${gramatura}`
    if (vistos.has(chave)) {
      conflitos.push({
        paNome: pa.nome,
        gramatura,
        variacoes: [vistos.get(chave), { id: v.id, nome }],
      })
      continue
    }
    const item = {
      paId: pa.id,
      paNome: pa.nome,
      gramatura,
      variacaoId: Number(v.id),
      codigo: v.codigo || null,
      saldoBling: saldoBlingDe(v),
    }
    vistos.set(chave, { id: v.id, nome })
    mapeadas.push(item)
  }

  return {
    totalProdutosBling: produtos.length,
    totalVariacoes: variacoes.length,
    mapeadas,
    naoReconhecidas,
    semProdutoLocal,
    conflitos,
  }
}
