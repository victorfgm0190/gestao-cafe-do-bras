// GET    /api/cafe-cru/lotes/:id   → um lote
// PUT    /api/cafe-cru/lotes/:id   → edita o lote e sincroniza a ENTRADA no kardex
// DELETE /api/cafe-cru/lotes/:id   → remove o lote (a movimentação de kardex
//                                     permanece, com lote_id = NULL — fiel ao app)

import { sql } from '../../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../../_http.js'
import {
  TIPOS_MOV,
  chaveGrupo,
  recalcularGrupo,
  custoMedioAtualGrupo,
  snapshotCustos,
} from '../_lib.js'

const num = (v) => Number(String(v ?? '').replace(',', '.')) || 0
const tem = (b, ...ks) => ks.some((k) => b[k] !== undefined && b[k] !== null && b[k] !== '')

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, ['GET', 'PUT', 'DELETE'])) return

  const id = Number(req.query.id)
  if (!Number.isFinite(id)) return enviarErro(res, 400, 'id inválido.')

  try {
    const existentes = await sql`SELECT * FROM lotes_cafe_cru WHERE id = ${id} LIMIT 1`
    const lote = existentes[0]
    if (!lote) return enviarErro(res, 404, 'Lote não encontrado.')

    if (req.method === 'GET') {
      return enviarJson(res, 200, { lote })
    }

    if (req.method === 'DELETE') {
      await sql`DELETE FROM lotes_cafe_cru WHERE id = ${id}`
      return enviarJson(res, 200, { deleted: true, id })
    }

    // PUT — edita e sincroniza o kardex
    const b = await lerCorpo(req)

    const produtor = String(b.produtor ?? lote.fazenda).trim()
    const variedade = String(b.variedade ?? lote.variedade).trim()
    const peso = tem(b, 'pesoTotal', 'peso_kg') ? num(b.pesoTotal ?? b.peso_kg) : Number(lote.peso_kg)
    const custoTotal = tem(b, 'custoTotal', 'custo_total')
      ? num(b.custoTotal ?? b.custo_total)
      : Number(lote.custo_total)
    const precoKg = tem(b, 'custoPorKg', 'preco_kg')
      ? num(b.custoPorKg ?? b.preco_kg)
      : peso > 0
        ? custoTotal / peso
        : Number(lote.preco_kg)
    const dataEntrada = b.recebimento ?? b.data_entrada ?? lote.data_entrada

    await sql`
      UPDATE lotes_cafe_cru SET
        data_entrada = ${dataEntrada},
        tipo_entrada = ${b.tipoEntrada ?? lote.tipo_entrada},
        sacas        = ${tem(b, 'sacas') ? num(b.sacas) : lote.sacas},
        peso_kg      = ${peso},
        tipo_cafe    = ${b.tipoCafe ?? lote.tipo_cafe},
        fazenda      = ${produtor},
        cidade       = ${b.cidade ?? lote.cidade},
        estado       = ${b.estado ? String(b.estado).toUpperCase().slice(0, 2) : lote.estado},
        variedade    = ${variedade},
        processo     = ${b.processo ?? lote.processo},
        safra        = ${b.safra ?? lote.safra},
        qualidade    = ${b.qualidade ?? lote.qualidade},
        umidade      = ${b.umidade ?? lote.umidade},
        custo_total  = ${custoTotal},
        preco_kg     = ${precoKg},
        nota_fiscal  = ${b.notaFiscal ?? lote.nota_fiscal},
        fornecedor   = ${b.fornecedor ?? lote.fornecedor},
        deposito     = ${b.deposito ?? lote.deposito},
        observacoes  = ${b.observacoes ?? lote.observacoes}
      WHERE id = ${id}
    `

    const grupoAntigo = chaveGrupo(lote.fazenda, lote.variedade)
    const grupoNovo = chaveGrupo(produtor, variedade)

    // Snapshot ANTES (para o relatório de impacto em cascata).
    const entradaRows = await sql`
      SELECT custo_unitario FROM kardex_cafe_cru
       WHERE lote_id = ${id} AND tipo = ${TIPOS_MOV.ENTRADA} LIMIT 1
    `
    const custoAntes = Number(entradaRows[0]?.custo_unitario) || 0
    const custoMedioAntes = await custoMedioAtualGrupo(grupoAntigo)
    const antes = await snapshotCustos([grupoAntigo, grupoNovo])

    // Sincroniza a ENTRADA vinculada a este lote (se existir).
    await sql`
      UPDATE kardex_cafe_cru SET
        data = ${dataEntrada},
        descricao = ${`${lote.codigo_lote} — ${produtor}`},
        produtor = ${produtor},
        variedade = ${variedade},
        grupo = ${grupoNovo},
        quantidade = ${peso},
        custo_unitario = ${precoKg}
      WHERE lote_id = ${id} AND tipo = ${TIPOS_MOV.ENTRADA}
    `

    // Reprocessa o(s) grupo(s) afetado(s).
    const resumoNovo = await recalcularGrupo(grupoNovo)
    if (grupoAntigo !== grupoNovo) await recalcularGrupo(grupoAntigo)

    // Diff de impacto: saídas cujo custo_total mudou.
    const depois = await snapshotCustos([grupoAntigo, grupoNovo])
    const movimentacoesAfetadas = []
    for (const mid of Object.keys(depois)) {
      const d = depois[mid]
      const a = antes[mid]
      if (!a || d.tipo === TIPOS_MOV.ENTRADA) continue
      const totalAntes = Number(a.custo_total) || 0
      const totalDepois = Number(d.custo_total) || 0
      if (Math.abs(totalDepois - totalAntes) > 1e-6) {
        movimentacoesAfetadas.push({
          id: Number(mid),
          data: d.data,
          tipo: d.tipo,
          descricao: d.descricao,
          custoTotalAntes: totalAntes,
          custoTotalDepois: totalDepois,
        })
      }
    }

    const atualizados = await sql`SELECT * FROM lotes_cafe_cru WHERE id = ${id} LIMIT 1`
    return enviarJson(res, 200, {
      lote: atualizados[0],
      resumoGrupo: resumoNovo,
      custoMedioAntes,
      custoMedioDepois: resumoNovo.custoMedio,
      movimentacoesAfetadas,
      resumo: `${movimentacoesAfetadas.length} movimentação(ões) recalculada(s)`,
      entrada: {
        produtor,
        variedade,
        grupo: grupoNovo,
        quantidade: peso,
        custoAntes,
        custoDepois: precoKg,
      },
    })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao processar o lote: ${erro?.message || erro}`)
  }
}
