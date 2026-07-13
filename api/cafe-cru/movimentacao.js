// POST /api/cafe-cru/movimentacao
// Registra uma movimentação (saída, perda, ajuste ou entrada avulsa) no kardex
// do café cru e reprocessa o saldo/custo médio do grupo.
//
// Corpo: { tipo, descricao, quantidade, custoUnitario, data, sentido,
//          produtor, variedade, lote_id? }
//   • tipo ∈ Entrada | Saída | Ajuste | Perda
//   • sentido ('positivo'|'negativo') só se aplica a Ajuste
//   • custoUnitario só é usado quando a movimentação ENTRA (delta > 0); as saídas
//     são valorizadas pelo custo médio vigente do grupo (no recálculo).

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../_http.js'
import { TIPOS_MOV, chaveGrupo, calcularDelta, recalcularGrupo } from './_lib.js'

const num = (v) => Number(String(v ?? '').replace(',', '.')) || 0

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'POST')) return

  try {
    const b = await lerCorpo(req)
    const tipo = b.tipo
    if (!Object.values(TIPOS_MOV).includes(tipo)) {
      return enviarErro(res, 400, `tipo inválido. Use um de: ${Object.values(TIPOS_MOV).join(', ')}.`)
    }

    // produtor/variedade são opcionais: o modal manual do Kardex registra
    // saída/perda/ajuste sem grupo (grupo vazio "|", valorizado a custo médio 0).
    const produtor = String(b.produtor || '').trim()
    const variedade = String(b.variedade || '').trim()

    const delta = calcularDelta(tipo, b.quantidade, b.sentido)
    if (delta === 0) {
      return enviarErro(res, 400, 'quantidade deve ser maior que zero.')
    }

    const grupo = chaveGrupo(produtor, variedade)
    // Só entradas carregam custo informado; saídas herdam o custo médio no recálculo.
    const custoInformado = delta > 0 ? num(b.custoUnitario) : 0
    const data = b.data || new Date().toISOString().slice(0, 10)
    const loteId = b.lote_id != null ? Number(b.lote_id) : null

    const inseridos = await sql`
      INSERT INTO kardex_cafe_cru
        (data, tipo, descricao, produtor, variedade, grupo, quantidade,
         custo_unitario, custo_total, saldo_acumulado, custo_medio, lote_id)
      VALUES
        (${data}, ${tipo}, ${b.descricao || ''}, ${produtor}, ${variedade}, ${grupo},
         ${delta}, ${custoInformado}, 0, 0, 0, ${loteId})
      RETURNING id
    `
    const novoId = inseridos[0].id

    const resumo = await recalcularGrupo(grupo)

    const linhas = await sql`SELECT * FROM kardex_cafe_cru WHERE id = ${novoId} LIMIT 1`
    return enviarJson(res, 201, { movimentacao: linhas[0], resumoGrupo: resumo })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao registrar a movimentação: ${erro?.message || erro}`)
  }
}
