// PUT    /api/cafe-cru/movimentacao/:id → edita uma ENTRADA e reprocessa em
//                                          cascata, devolvendo o relatório de impacto
// DELETE /api/cafe-cru/movimentacao/:id → remove a movimentação e reprocessa o grupo
//
// Espelha kardex.editarEntrada + reprocessarLedgerGrupo (relatório de impacto)
// e kardex.removerMovimentacao do app original.

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

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, ['PUT', 'DELETE'])) return

  const id = Number(req.query.id)
  if (!Number.isFinite(id)) return enviarErro(res, 400, 'id inválido.')

  try {
    const alvoRows = await sql`SELECT * FROM kardex_cafe_cru WHERE id = ${id} LIMIT 1`
    const alvo = alvoRows[0]
    if (!alvo) return enviarErro(res, 404, 'Movimentação não encontrada.')

    // ---------- DELETE ----------
    if (req.method === 'DELETE') {
      const grupo = alvo.grupo
      await sql`DELETE FROM kardex_cafe_cru WHERE id = ${id}`
      const resumo = await recalcularGrupo(grupo)
      return enviarJson(res, 200, { deleted: true, id, resumoGrupo: resumo })
    }

    // ---------- PUT (edição de ENTRADA + cascata) ----------
    if (alvo.tipo !== TIPOS_MOV.ENTRADA) {
      return enviarErro(res, 400, 'A movimentação não é uma entrada.')
    }
    const b = await lerCorpo(req)

    const grupoAntigo = alvo.grupo
    const produtor = b.produtor !== undefined ? String(b.produtor).trim() : alvo.produtor
    const variedade = b.variedade !== undefined ? String(b.variedade).trim() : alvo.variedade
    const grupoNovo = chaveGrupo(produtor, variedade)

    const custoAntes = Number(alvo.custo_unitario) || 0
    const custoMedioAntes = await custoMedioAtualGrupo(grupoAntigo)
    const antes = await snapshotCustos([grupoAntigo, grupoNovo])

    // Aplica a edição (campos opcionais).
    const quantidade =
      b.quantidade !== undefined ? Math.abs(num(b.quantidade)) : Number(alvo.quantidade)
    const custoUnitario =
      b.custoUnitario !== undefined ? num(b.custoUnitario) : Number(alvo.custo_unitario)
    const data = b.data || alvo.data
    const descricao = b.descricao !== undefined ? b.descricao : alvo.descricao

    await sql`
      UPDATE kardex_cafe_cru SET
        quantidade = ${quantidade},
        custo_unitario = ${custoUnitario},
        data = ${data},
        descricao = ${descricao},
        produtor = ${produtor},
        variedade = ${variedade},
        grupo = ${grupoNovo}
      WHERE id = ${id}
    `

    // Reprocessa o(s) grupo(s) afetado(s).
    const resumoNovo = await recalcularGrupo(grupoNovo)
    if (grupoAntigo !== grupoNovo) await recalcularGrupo(grupoAntigo)
    const custoMedioDepois = resumoNovo.custoMedio

    // Diff do impacto: saídas cujo custo_total mudou.
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

    return enviarJson(res, 200, {
      custoMedioAntes,
      custoMedioDepois,
      movimentacoesAfetadas,
      resumo: `${movimentacoesAfetadas.length} movimentação(ões) recalculada(s)`,
      entrada: {
        produtor,
        variedade,
        grupo: grupoNovo,
        quantidade,
        custoAntes,
        custoDepois: custoUnitario,
      },
    })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao processar a movimentação: ${erro?.message || erro}`)
  }
}
