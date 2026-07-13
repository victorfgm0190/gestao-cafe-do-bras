// POST /api/inventario/:id/regularizar
// Regulariza um item do inventário, aplicando o ajuste no kardex/estoque do
// módulo correspondente (café cru, torrado, insumo ou PA) e marcando o item.
// Corpo: { index, itens?, descricao?, quantidade? }
//   itens (opcional) = estado atual dos itens (com as contagens físicas) do front.

import { sql } from '../../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../../_http.js'
import { CATEGORIAS } from '../_lib.js'
import { chaveGrupo, recalcularGrupo } from '../../cafe-cru/_lib.js'
import { recalcularTorrado } from '../../torrado/_lib.js'
import { recalcularInsumo } from '../../insumos/_lib.js'
import { ajustarEstoquePA } from '../../pa/_lib.js'

const AJUSTE = 'Ajuste'
const SAIDA = 'Saída'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'POST')) return

  const id = Number(req.query.id)
  if (!Number.isFinite(id)) return enviarErro(res, 400, 'id inválido.')

  try {
    const invRows = await sql`SELECT * FROM inventarios WHERE id = ${id} LIMIT 1`
    const inv = invRows[0]
    if (!inv) return enviarErro(res, 404, 'Inventário não encontrado.')

    const b = await lerCorpo(req)
    const itens = Array.isArray(b.itens) ? b.itens : inv.itens || []
    const index = Number(b.index)
    const item = itens[index]
    if (!item || item.status === 'ok' || item.regularizado) {
      // Nada a fazer — persiste os itens (contagens) e devolve.
      const linhas = await sql`
        UPDATE inventarios SET itens = ${JSON.stringify(itens)}::jsonb WHERE id = ${id} RETURNING *
      `
      return enviarJson(res, 200, { inventario: linhas[0] })
    }

    const sobra = item.diferenca > 0
    const sentido = sobra ? 'positivo' : 'negativo'
    const quantidade = Math.abs(Number(b.quantidade ?? item.diferenca)) || 0
    const dataRef = typeof inv.data === 'string' ? inv.data.slice(0, 10) : inv.data
    const descPadrao = sobra
      ? `Ajuste positivo - Inventário ${dataRef}`
      : item.categoria === CATEGORIAS.EMBALADO
        ? `Saída não identificada - Inventário ${dataRef}`
        : `Perda - Inventário ${dataRef}`
    const descricao = String(b.descricao || descPadrao).trim()
    let tipoReg = 'ajuste'
    if (!sobra) tipoReg = item.categoria === CATEGORIAS.EMBALADO ? 'saida_nao_identificada' : 'perda'

    const delta = sobra ? quantidade : -quantidade

    if (item.categoria === CATEGORIAS.CRU) {
      const saldoFisico = Math.max(0, Number(item.saldoFisico) || 0)
      if (item.loteId != null) {
        await sql`
          UPDATE lotes_cafe_cru
             SET saldo_disponivel = ${saldoFisico}, status = ${saldoFisico > 0 ? 'disponivel' : 'esgotado'}
           WHERE id = ${item.loteId}
        `
      }
      const grupo = chaveGrupo(item.produtor, item.variedade)
      await sql`
        INSERT INTO kardex_cafe_cru
          (data, tipo, descricao, produtor, variedade, grupo, quantidade,
           custo_unitario, custo_total, saldo_acumulado, custo_medio)
        VALUES (${dataRef}, ${AJUSTE}, ${descricao}, ${item.produtor || ''}, ${item.variedade || ''},
                ${grupo}, ${delta}, 0, 0, 0, 0)
      `
      await recalcularGrupo(grupo)
    } else if (item.categoria === CATEGORIAS.TORRADO) {
      await sql`
        INSERT INTO kardex_cafe_torrado
          (data, tipo, descricao, quantidade, custo_unitario, custo_total, saldo_acumulado, custo_medio)
        VALUES (${dataRef}, ${AJUSTE}, ${descricao}, ${delta}, 0, 0, 0, 0)
      `
      await recalcularTorrado()
    } else if (item.categoria === CATEGORIAS.INSUMO) {
      await sql`
        INSERT INTO kardex_insumos
          (insumo_id, data, tipo, descricao, quantidade, custo_unitario, custo_total, saldo_acumulado, custo_medio)
        VALUES (${item.insumoId}, ${dataRef}, ${AJUSTE}, ${descricao}, ${delta}, 0, 0, 0, 0)
      `
      await recalcularInsumo(item.insumoId)
    } else if (item.categoria === CATEGORIAS.EMBALADO) {
      await ajustarEstoquePA({
        paId: item.paId,
        gramatura: item.gramatura,
        quantidade: delta,
        descricao,
        data: dataRef,
      })
    }

    itens[index] = { ...item, regularizado: true, regularizacao: { tipo: tipoReg, descricao, quantidade } }
    const linhas = await sql`
      UPDATE inventarios SET itens = ${JSON.stringify(itens)}::jsonb WHERE id = ${id} RETURNING *
    `
    return enviarJson(res, 200, { inventario: linhas[0] })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao regularizar: ${erro?.message || erro}`)
  }
}
