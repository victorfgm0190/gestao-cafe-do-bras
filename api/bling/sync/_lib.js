// Base da sincronização com o Bling. Arquivos com "_" não viram rotas.
//
// O que este módulo existe para resolver: no Bling cada gramatura é uma
// VARIAÇÃO com id próprio, e nós só guardávamos `pa_cadastro.bling_id`, que é o
// id do produto PAI. Sem o id da variação não dá para enviar nem comparar saldo
// por gramatura. O mapa (produto_id, gramatura) → bling_variacao_id vive em
// `bling_sync_status`, que já nascia com UNIQUE (produto_id, gramatura).

import { sql } from '../../db.js'
import { blingFetch } from '../auth.js'

export {
  gramaturaDeTexto,
  nomePai,
  ehVariacao,
  saldoBlingDe,
  dataLocal,
} from './_regras.js'

// Colunas e tabela que a sincronização acrescenta. Idempotente, no mesmo
// espírito de importar-produtos-pa.js: roda uma vez por processo, para a
// integração não depender de alguém ter rodado /api/setup.
let estruturaPronta = false
export async function garantirEstrutura() {
  if (estruturaPronta) return
  await sql`ALTER TABLE bling_sync_status ADD COLUMN IF NOT EXISTS bling_variacao_id bigint`
  await sql`ALTER TABLE bling_sync_status ADD COLUMN IF NOT EXISTS bling_codigo text`
  // Sem isto, rodar o pull duas vezes baixaria o estoque duas vezes.
  await sql`
    CREATE TABLE IF NOT EXISTS bling_pedidos_processados (
      bling_pedido_id bigint PRIMARY KEY,
      numero text,
      data date,
      itens_aplicados integer NOT NULL DEFAULT 0,
      processado_em timestamp NOT NULL DEFAULT NOW()
    )
  `
  estruturaPronta = true
}

// Todos os produtos do Bling (pais e variações), 100 por página — o limite da
// API é 100, não 999.
export async function buscarProdutosBling(maxPaginas = 50) {
  const todos = []
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const params = new URLSearchParams({ pagina: String(pagina), limite: '100' })
    const json = await blingFetch(`/produtos?${params.toString()}`)
    const lista = Array.isArray(json.data) ? json.data : []
    todos.push(...lista)
    if (lista.length < 100) break
  }
  return todos
}

// Saldo local por (pa_id, gramatura). pa_estoque é RAZÃO — uma linha por
// movimento — então saldo é SUM, nunca o valor de uma linha.
export async function saldosLocais() {
  return sql`
    SELECT e.pa_id,
           p.nome       AS pa_nome,
           p.bling_id,
           e.gramatura,
           SUM(e.quantidade) AS saldo
      FROM pa_estoque e
      JOIN pa_cadastro p ON p.id = e.pa_id
     GROUP BY e.pa_id, p.nome, p.bling_id, e.gramatura
     ORDER BY p.nome, e.gramatura
  `
}

// Mapa gravado: (pa_id, gramatura) → id da variação no Bling.
export async function carregarMapa() {
  return sql`
    SELECT s.produto_id, s.gramatura, s.bling_variacao_id, s.bling_codigo,
           p.nome AS pa_nome
      FROM bling_sync_status s
      JOIN pa_cadastro p ON p.id = s.produto_id
     WHERE s.bling_variacao_id IS NOT NULL
     ORDER BY p.nome, s.gramatura
  `
}

// Uma linha no log append-only. `origem` é NOT NULL com CHECK no schema, e
// `tipo` só aceita PUSH_PRODUCAO | PULL_VENDA | AJUSTE_DIVERGENCIA.
export async function registrarSync({
  tipo,
  produtoId = null,
  gramatura = null,
  saldoAntes = null,
  saldoDepois = null,
  quantidadeAlterada = null,
  origem,
  status = 'SUCESSO',
  mensagem = null,
  usuarioId = null,
  blingResponse = null,
}) {
  await sql`
    INSERT INTO bling_sync_log
      (tipo, produto_id, gramatura, saldo_antes, saldo_depois, quantidade_alterada,
       origem, status, mensagem, usuario_id, bling_response)
    VALUES (${tipo}, ${produtoId}, ${gramatura}, ${saldoAntes}, ${saldoDepois},
            ${quantidadeAlterada}, ${origem}, ${status}, ${mensagem}, ${usuarioId},
            ${blingResponse ? JSON.stringify(blingResponse) : null}::jsonb)
  `
}
