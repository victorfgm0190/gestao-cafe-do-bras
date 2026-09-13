// GET /api/bling/sync/divergencias → compara o saldo local com o do Bling,
// por (produto, gramatura). SÓ LEITURA no Bling: nada é enviado.
//
// Saldo local sai de SUM(pa_estoque.quantidade) — pa_estoque é razão, uma linha
// por movimento. Saldo do Bling vem da variação correspondente no mapa.
//
// O resultado é gravado em bling_sync_status (saldo_cafe_do_bras, saldo_bling,
// divergencia, status_divergencia). Não gravamos em bling_sync_log: o CHECK da
// tabela só aceita PUSH_PRODUCAO | PULL_VENDA | AJUSTE_DIVERGENCIA, e conferir
// não é ajustar.

import { sql, transacao } from '../../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo } from '../../_http.js'
import { exigirPermissao } from '../../_auth.js'
import { buscarProdutosBling, garantirEstrutura, saldoBlingDe, saldosLocais } from './_lib.js'

const MODULO = 'Estoque PA'

// Severidade só para a tela; a coluna status_divergencia tem CHECK próprio.
function severidade(diferenca) {
  const d = Math.abs(diferenca)
  if (d === 0) return 'OK'
  if (d < 5) return 'AVISO'
  return 'CRITICO'
}

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'GET')) return
  const autorizado = await exigirPermissao(req, res, MODULO)
  if (!autorizado) return

  try {
    await garantirEstrutura()

    const mapa = await sql`
      SELECT produto_id, gramatura, bling_variacao_id
        FROM bling_sync_status
       WHERE bling_variacao_id IS NOT NULL
    `
    if (mapa.length === 0) {
      return enviarErro(
        res,
        409,
        'O mapa de variações está vazio. Rode POST /api/bling/sync/mapa antes de comparar.',
      )
    }

    const [locais, produtos] = await Promise.all([saldosLocais(), buscarProdutosBling()])
    const saldoPorVariacao = new Map(produtos.map((p) => [String(p.id), saldoBlingDe(p)]))
    const variacaoPorChave = new Map(
      mapa.map((m) => [`${m.produto_id}|${m.gramatura}`, String(m.bling_variacao_id)]),
    )

    const linhas = []
    const semMapa = []

    for (const l of locais) {
      const chave = `${l.pa_id}|${l.gramatura}`
      const variacaoId = variacaoPorChave.get(chave)
      const saldoLocal = Number(l.saldo) || 0

      if (!variacaoId) {
        semMapa.push({ paId: l.pa_id, paNome: l.pa_nome, gramatura: l.gramatura, saldoLocal })
        continue
      }

      const saldoBling = saldoPorVariacao.get(variacaoId)
      // Variação mapeada que sumiu do Bling: reportar é melhor que assumir zero.
      if (saldoBling === undefined) {
        semMapa.push({
          paId: l.pa_id,
          paNome: l.pa_nome,
          gramatura: l.gramatura,
          saldoLocal,
          observacao: `Variação ${variacaoId} não veio na listagem do Bling.`,
        })
        continue
      }

      const diferenca = saldoLocal - saldoBling
      linhas.push({
        paId: l.pa_id,
        paNome: l.pa_nome,
        gramatura: l.gramatura,
        variacaoId: Number(variacaoId),
        saldoLocal,
        saldoBling,
        diferenca,
        severidade: severidade(diferenca),
      })
    }

    if (linhas.length > 0) {
      await transacao(
        linhas.map(
          (d) => sql`
            UPDATE bling_sync_status
               SET saldo_cafe_do_bras = ${d.saldoLocal},
                   saldo_bling = ${d.saldoBling},
                   divergencia = ${d.diferenca},
                   status_divergencia = ${d.diferenca === 0 ? 'SINCRONIZADO' : 'DIVERGENCIA'},
                   atualizado_em = NOW()
             WHERE produto_id = ${d.paId} AND gramatura = ${d.gramatura}
          `,
        ),
      )
    }

    const divergentes = linhas.filter((d) => d.diferenca !== 0)
    return enviarJson(res, 200, {
      comparados: linhas.length,
      divergencias: divergentes.length,
      criticas: divergentes.filter((d) => d.severidade === 'CRITICO').length,
      detalhes: divergentes,
      sincronizados: linhas.length - divergentes.length,
      semMapa,
    })
  } catch (erro) {
    const status = erro?.status === 401 ? 401 : 502
    return enviarErro(res, status, `Falha ao comparar saldos: ${erro?.message || erro}`)
  }
}
