// GET  /api/torrado/torras → histórico de torras
// POST /api/torrado/torras → registra uma torra:
//   (a) baixa o peso cru do lote de origem
//   (b) lança SAÍDA no kardex do café cru (valorizada pelo custo médio do grupo)
//   (c) gera ENTRADA no kardex do torrado: custo = (pesoCru × custoLote) / pesoTorrado
//   (d) grava o histórico da torra
//
// Corpo: { data, loteId, pesoCru, pesoTorrado, perfil, observacao }

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../_http.js'
import { TIPOS_MOV, recalcularTorrado, formatarDataBR } from './_lib.js'
import { chaveGrupo, recalcularGrupo, custoMedioAtualGrupo } from '../cafe-cru/_lib.js'

const num = (v) => Number(String(v ?? '').replace(',', '.')) || 0

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, ['GET', 'POST'])) return

  try {
    if (req.method === 'GET') {
      const torras = await sql`SELECT * FROM torras_historico ORDER BY data ASC, id ASC`
      return enviarJson(res, 200, { torras })
    }

    const b = await lerCorpo(req)
    const pesoCru = num(b.pesoCru)
    const pesoTorrado = num(b.pesoTorrado)
    const data = b.data || new Date().toISOString().slice(0, 10)

    const lotes = await sql`SELECT * FROM lotes_cafe_cru WHERE id = ${Number(b.loteId)} LIMIT 1`
    const lote = lotes[0]
    if (!lote) return enviarErro(res, 404, 'Lote de café cru não encontrado.')

    const grupo = chaveGrupo(lote.fazenda, lote.variedade)
    const custoLote = (await custoMedioAtualGrupo(grupo)) || Number(lote.preco_kg) || 0

    // (a) baixa o peso cru do lote
    const novoSaldo = Math.max(0, (Number(lote.saldo_disponivel) || 0) - pesoCru)
    await sql`
      UPDATE lotes_cafe_cru
         SET saldo_disponivel = ${novoSaldo}, status = ${novoSaldo > 0 ? 'disponivel' : 'esgotado'}
       WHERE id = ${lote.id}
    `

    // (b) saída no kardex do café cru
    const descCru = `Torra ${formatarDataBR(data)} — ${lote.codigo_lote || 'lote'}`
    const movCruRows = await sql`
      INSERT INTO kardex_cafe_cru
        (data, tipo, descricao, produtor, variedade, grupo, quantidade,
         custo_unitario, custo_total, saldo_acumulado, custo_medio, lote_id)
      VALUES (${data}, ${TIPOS_MOV.SAIDA}, ${descCru}, ${lote.fazenda}, ${lote.variedade},
              ${grupo}, ${-pesoCru}, ${custoLote}, 0, 0, 0, ${lote.id})
      RETURNING id
    `
    const movCruId = movCruRows[0].id
    await recalcularGrupo(grupo)

    // (c) entrada no kardex do torrado
    const custoTorradoUnit = pesoTorrado > 0 ? (pesoCru * custoLote) / pesoTorrado : 0
    const perdaPct = pesoCru > 0 ? ((pesoCru - pesoTorrado) / pesoCru) * 100 : 0
    const perdaFmt = `${perdaPct.toFixed(1)}%`
    const descTorr = `Torra ${formatarDataBR(data)} — ${lote.codigo_lote || 'lote'} (${b.perfil}) | Cru: R$ ${custoLote.toFixed(2)}/kg | Perda: ${perdaFmt}`
    const movTorrRows = await sql`
      INSERT INTO kardex_cafe_torrado
        (data, tipo, descricao, quantidade, custo_unitario, custo_total, saldo_acumulado, custo_medio)
      VALUES (${data}, ${TIPOS_MOV.ENTRADA}, ${descTorr}, ${pesoTorrado}, ${custoTorradoUnit}, 0, 0, 0)
      RETURNING id
    `
    const movTorradoId = movTorrRows[0].id
    await recalcularTorrado()

    // (d) histórico da torra
    const rendimento = pesoCru > 0 ? (pesoTorrado / pesoCru) * 100 : 0
    const torraRows = await sql`
      INSERT INTO torras_historico
        (data, lote_id, lote_codigo, produtor, peso_cru, peso_torrado, perda, rendimento,
         perfil, observacao, custo_por_kg_lote, custo_torrado_unit, mov_cru_id, mov_torrado_id)
      VALUES (${data}, ${lote.id}, ${lote.codigo_lote || ''}, ${lote.fazenda || ''},
              ${pesoCru}, ${pesoTorrado}, ${pesoCru - pesoTorrado}, ${rendimento},
              ${b.perfil || ''}, ${(b.observacao || '').trim()}, ${custoLote}, ${custoTorradoUnit},
              ${movCruId}, ${movTorradoId})
      RETURNING *
    `
    return enviarJson(res, 201, { torra: torraRows[0] })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao registrar a torra: ${erro?.message || erro}`)
  }
}
