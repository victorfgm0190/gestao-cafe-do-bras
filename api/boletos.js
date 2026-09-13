// GET  /api/boletos → lista com filtros e paginação
//   Query: ?status=&fornecedor=&pagina=1&limite=20
// POST /api/boletos → cria o boleto e gera as parcelas
//   Corpo: { fornecedor, valorTotal, parcelasQuantidade, dataEntrada?, observacoes?,
//            vencimentos? } — vencimentos é uma data por parcela; sem ele, os
//            vencimentos seguem data_entrada + N meses
//
// A criação é UMA statement com CTEs (INSERT no boleto + INSERT nas parcelas):
// o driver HTTP do Neon não abre transação interativa, e uma statement só já é
// atômica — boleto sem parcela não existe.

import { sql } from './db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from './_http.js'
import { exigirPermissao, registrarAudit } from './_auth.js'
import {
  STATUS_BOLETO,
  hojeLocal,
  montarBoleto,
  montarVencimentos,
  vencimentosForaDeOrdem,
} from './boletos/_lib.js'

const MODULO = 'Contas a Pagar'
const LIMITE_PADRAO = 20
const LIMITE_MAXIMO = 100

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, ['GET', 'POST'])) return
  const autorizado = await exigirPermissao(req, res, MODULO)
  if (!autorizado) return

  try {
    if (req.method === 'GET') return await listar(req, res)
    return await criar(req, res, autorizado)
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao processar boletos: ${erro?.message || erro}`)
  }
}

async function listar(req, res) {
  const q = req.query || {}
  const status = q.status ? String(q.status).toUpperCase() : null
  const fornecedor = q.fornecedor ? String(q.fornecedor).trim() : null

  if (status && !STATUS_BOLETO.includes(status)) {
    return enviarErro(res, 400, `Status inválido. Válidos: ${STATUS_BOLETO.join(', ')}.`)
  }

  const pagina = Math.max(1, Number(q.pagina) || 1)
  const limite = Math.min(LIMITE_MAXIMO, Math.max(1, Number(q.limite) || LIMITE_PADRAO))
  const offset = (pagina - 1) * limite

  // Os filtros entram como parâmetros anuláveis em vez de SQL montado em string.
  const linhas = await sql`
    SELECT b.*,
           COUNT(p.id)                                        AS parcelas_total,
           COUNT(p.id) FILTER (WHERE p.status = 'PAGO')       AS parcelas_pagas,
           COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'PAGO'), 0) AS valor_pago,
           COUNT(*) OVER ()                                   AS total_registros
      FROM boletos b
      LEFT JOIN boleto_parcelas p ON p.boleto_id = b.id
     WHERE b.excluido_em IS NULL
       AND (${status}::text IS NULL OR b.status = ${status})
       AND (${fornecedor}::text IS NULL OR b.fornecedor ILIKE '%' || ${fornecedor} || '%')
     GROUP BY b.id
     ORDER BY b.criado_em DESC, b.id DESC
     LIMIT ${limite} OFFSET ${offset}
  `

  // COUNT(*) OVER () roda depois do GROUP BY: conta os boletos da página,
  // não as linhas do join. Vem repetido em toda linha; zero linhas = zero total.
  const total = linhas.length > 0 ? Number(linhas[0].total_registros) : 0
  const boletos = linhas.map(({ total_registros, ...b }) => b)

  return enviarJson(res, 200, {
    boletos,
    paginacao: {
      total,
      pagina,
      limite,
      paginas: Math.max(1, Math.ceil(total / limite)),
    },
  })
}

async function criar(req, res, usuario) {
  const corpo = await lerCorpo(req)
  const dados = montarBoleto(corpo)
  if (dados.erro) return enviarErro(res, 400, dados.erro)
  const { fornecedor, dataEntrada, valorTotal, qtd, valorParcela, ultima, observacoes } = dados

  // Vencimentos um a um são opcionais: sem eles vale data_entrada + N meses.
  const v = montarVencimentos(corpo.vencimentos, { qtd, dataEntrada, hoje: hojeLocal() })
  if (v.erro) return enviarErro(res, 400, v.erro)
  // 'null' (e não NULL) porque o parâmetro é lido como jsonb dentro do SQL.
  const datasJson = v.vencimentos ? JSON.stringify(v.vencimentos) : 'null'

  const linhas = await sql`
    WITH novo AS (
      INSERT INTO boletos (fornecedor, data_entrada, valor_total, parcelas_quantidade,
                           valor_parcela, status, observacoes)
      VALUES (${fornecedor}, ${dataEntrada}, ${valorTotal}, ${qtd},
              ${valorParcela}, 'SEM_VINCULO', ${observacoes})
      RETURNING *
    ),
    criadas AS (
      INSERT INTO boleto_parcelas (boleto_id, numero_parcela, valor, data_vencimento)
      SELECT nb.id,
             g.i,
             CASE WHEN g.i < ${qtd}::int THEN ${valorParcela}::numeric ELSE ${ultima}::numeric END,
             CASE
               WHEN jsonb_typeof(${datasJson}::jsonb) = 'array'
                 THEN (${datasJson}::jsonb ->> (g.i - 1)::int)::date
               -- '+ interval mes' trata o fim de mes: 31/01 + 1 mes = 28/02.
               ELSE (nb.data_entrada + (g.i || ' month')::interval)::date
             END
        FROM novo nb, generate_series(1, ${qtd}::int) AS g(i)
      RETURNING *
    )
    SELECT (SELECT to_jsonb(nb) FROM novo nb) AS boleto,
           (SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.numero_parcela), '[]'::jsonb)
              FROM criadas c) AS parcelas
  `

  const { boleto, parcelas } = linhas[0]

  await registrarAudit({
    usuario: usuario.nome,
    acao: 'Incluiu',
    modulo: MODULO,
    detalhes: `Boleto de ${fornecedor}: R$ ${valorTotal.toFixed(2)} em ${qtd}x`,
  })

  return enviarJson(res, 201, {
    boleto: { ...boleto, parcelas },
    aviso: vencimentosForaDeOrdem(parcelas.map((p) => String(p.data_vencimento).slice(0, 10)))
      ? 'As parcelas não estão em ordem crescente de vencimento.'
      : null,
  })
}
