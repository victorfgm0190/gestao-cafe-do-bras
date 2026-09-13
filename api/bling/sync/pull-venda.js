// POST /api/bling/sync/pull-venda → traz as vendas do Bling e baixa o estoque.
//   Corpo: { dataInicial?, dataFinal?, situacoes?, confirmar? }
//   Sem `confirmar: true` a rota SIMULA: mostra o que baixaria e não grava.
//
// É POST, não GET, porque muda estado. GET com efeito colateral quebra em
// qualquer camada que faça prefetch ou retry.
//
// A baixa entra como MOVIMENTO NEGATIVO em pa_estoque (via ajustarEstoquePA),
// nunca como UPDATE na quantidade: pa_estoque é razão, uma linha por movimento
// — um UPDATE reescreveria o histórico e o custo de todas as produções.
//
// Idempotência: cada pedido processado é registrado em
// `bling_pedidos_processados` ANTES de aplicar. Se o processo morrer no meio, o
// pedido fica marcado e não é reaplicado: baixar de menos se conserta à mão,
// baixar em dobro corrompe o estoque em silêncio.

import { sql } from '../../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../../_http.js'
import { exigirPermissao } from '../../_auth.js'
import { blingFetch } from '../auth.js'
import { ajustarEstoquePA } from '../../pa/_lib.js'
import { dataLocal, garantirEstrutura, registrarSync } from './_lib.js'

const MODULO = 'Estoque PA'

async function buscarPedidos(dataInicial, dataFinal, maxPaginas = 20) {
  const todos = []
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const params = new URLSearchParams({
      dataInicial,
      dataFinal,
      pagina: String(pagina),
      limite: '100',
    })
    const json = await blingFetch(`/pedidos/vendas?${params.toString()}`)
    const lista = Array.isArray(json.data) ? json.data : []
    todos.push(...lista)
    if (lista.length < 100) break
  }
  return todos
}

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'POST')) return
  const autorizado = await exigirPermissao(req, res, MODULO, 'editar')
  if (!autorizado) return

  try {
    await garantirEstrutura()
    const corpo = await lerCorpo(req)
    const confirmar = corpo.confirmar === true
    const dataInicial = corpo.dataInicial || dataLocal(1)
    const dataFinal = corpo.dataFinal || dataLocal(0)
    // Ids de situação do Bling variam por conta; sem lista, não filtramos e a
    // simulação mostra a situação de cada pedido para você decidir.
    const situacoes = Array.isArray(corpo.situacoes) ? corpo.situacoes.map(String) : null

    const mapa = await sql`
      SELECT s.produto_id, s.gramatura, s.bling_variacao_id, s.bling_codigo, p.nome AS pa_nome
        FROM bling_sync_status s
        JOIN pa_cadastro p ON p.id = s.produto_id
       WHERE s.bling_variacao_id IS NOT NULL
    `
    if (mapa.length === 0) {
      return enviarErro(
        res,
        409,
        'O mapa de variações está vazio. Rode POST /api/bling/sync/mapa antes do pull.',
      )
    }
    const porVariacao = new Map(mapa.map((m) => [String(m.bling_variacao_id), m]))
    const porCodigo = new Map(mapa.filter((m) => m.bling_codigo).map((m) => [String(m.bling_codigo), m]))

    const pedidos = await buscarPedidos(dataInicial, dataFinal)
    const filtrados = situacoes
      ? pedidos.filter((p) => situacoes.includes(String(p.situacao?.id ?? p.situacao?.valor ?? '')))
      : pedidos

    // Quais destes já foram processados numa rodada anterior?
    const ids = filtrados.map((p) => Number(p.id)).filter(Boolean)
    const jaProcessados = new Set()
    if (ids.length > 0) {
      const linhas = await sql`
        SELECT bling_pedido_id FROM bling_pedidos_processados
         WHERE bling_pedido_id IN (
           SELECT (jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))::bigint
         )
      `
      linhas.forEach((l) => jaProcessados.add(String(l.bling_pedido_id)))
    }

    const planejados = []
    const naoMapeados = []

    for (const pedido of filtrados) {
      if (jaProcessados.has(String(pedido.id))) continue
      const itens = Array.isArray(pedido.itens) ? pedido.itens : []
      const baixas = []
      for (const it of itens) {
        const idProduto = it.produto?.id ?? it.produtoId ?? null
        const alvo =
          (idProduto && porVariacao.get(String(idProduto))) ||
          (it.codigo && porCodigo.get(String(it.codigo))) ||
          null
        const quantidade = Number(it.quantidade) || 0
        if (!alvo || quantidade <= 0) {
          naoMapeados.push({
            pedido: pedido.numero ?? pedido.id,
            codigo: it.codigo || '',
            descricao: it.descricao || '',
            quantidade,
          })
          continue
        }
        baixas.push({
          paId: alvo.produto_id,
          paNome: alvo.pa_nome,
          gramatura: alvo.gramatura,
          quantidade,
        })
      }
      if (baixas.length > 0) {
        planejados.push({
          pedidoId: Number(pedido.id),
          numero: pedido.numero ?? null,
          data: pedido.data ?? null,
          situacao: pedido.situacao?.valor ?? pedido.situacao?.id ?? null,
          baixas,
        })
      }
    }

    if (!confirmar) {
      return enviarJson(res, 200, {
        simulacao: true,
        periodo: { dataInicial, dataFinal },
        pedidosEncontrados: filtrados.length,
        pedidosJaProcessados: jaProcessados.size,
        pedidosAAplicar: planejados.length,
        unidadesABaixar: planejados.reduce(
          (s, p) => s + p.baixas.reduce((t, b) => t + b.quantidade, 0),
          0,
        ),
        detalhes: planejados,
        naoMapeados,
        mensagem:
          planejados.length === 0
            ? 'Nenhum pedido novo para baixar neste período.'
            : `${planejados.length} pedido(s) seriam baixados. Envie confirmar: true para aplicar.`,
      })
    }

    const aplicados = []
    const falhas = []
    for (const p of planejados) {
      // Reivindica o pedido antes de mexer no estoque (ver nota de idempotência
      // no topo). Se outra execução já reivindicou, pulamos.
      const reivindicado = await sql`
        INSERT INTO bling_pedidos_processados (bling_pedido_id, numero, data, itens_aplicados)
        VALUES (${p.pedidoId}, ${p.numero ? String(p.numero) : null},
                ${p.data ? String(p.data).slice(0, 10) : null}, 0)
        ON CONFLICT (bling_pedido_id) DO NOTHING
        RETURNING bling_pedido_id
      `
      if (reivindicado.length === 0) continue

      let aplicadosNoPedido = 0
      for (const b of p.baixas) {
        try {
          await ajustarEstoquePA({
            paId: b.paId,
            gramatura: b.gramatura,
            quantidade: -Math.abs(b.quantidade),
            descricao: `Venda Bling ${p.numero ? `#${p.numero}` : p.pedidoId}`,
            origem: 'bling',
          })
          await registrarSync({
            tipo: 'PULL_VENDA',
            produtoId: b.paId,
            gramatura: b.gramatura,
            quantidadeAlterada: -Math.abs(b.quantidade),
            origem: 'VENDA_BLING',
            status: 'SUCESSO',
            mensagem: `Pedido ${p.numero ?? p.pedidoId}`,
            usuarioId: autorizado.id,
          })
          aplicadosNoPedido++
        } catch (e) {
          await registrarSync({
            tipo: 'PULL_VENDA',
            produtoId: b.paId,
            gramatura: b.gramatura,
            quantidadeAlterada: -Math.abs(b.quantidade),
            origem: 'VENDA_BLING',
            status: 'ERRO',
            mensagem: `Pedido ${p.numero ?? p.pedidoId}: ${e?.message || 'falha'}`,
            usuarioId: autorizado.id,
          })
          falhas.push({ pedido: p.numero ?? p.pedidoId, ...b, erro: e?.message || 'falha' })
        }
      }

      await sql`
        UPDATE bling_pedidos_processados
           SET itens_aplicados = ${aplicadosNoPedido}
         WHERE bling_pedido_id = ${p.pedidoId}
      `
      aplicados.push({ ...p, itensAplicados: aplicadosNoPedido })
    }

    return enviarJson(res, falhas.length > 0 ? 207 : 200, {
      simulacao: false,
      periodo: { dataInicial, dataFinal },
      pedidosAplicados: aplicados.length,
      unidadesBaixadas: aplicados.reduce(
        (s, p) => s + p.baixas.reduce((t, b) => t + b.quantidade, 0),
        0,
      ),
      detalhes: aplicados,
      naoMapeados,
      erros: falhas,
      mensagem: `${aplicados.length} pedido(s) baixado(s) do estoque${
        falhas.length ? `, ${falhas.length} item(ns) com erro` : ''
      }.`,
    })
  } catch (erro) {
    const status = erro?.status === 401 ? 401 : 502
    return enviarErro(res, status, `Falha no pull de vendas: ${erro?.message || erro}`)
  }
}
