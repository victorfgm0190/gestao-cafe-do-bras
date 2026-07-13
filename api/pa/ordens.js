// GET  /api/pa/ordens → lista as ordens de produção
// POST /api/pa/ordens → registra uma ordem: baixa café cru (N lotes) + saídas no
//   kardex do cru, gera a sobra no torrado (custo zero), baixa embalagens no
//   kardex de insumos e produz os pacotes de PA (estoque + movimentação).
//
// Corpo: { data, paId, itens:[{gramatura, quantidade}], lotes:[{loteId, kg}], sobra }

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../_http.js'
import { TIPOS_MOV, calcularOrdem, formatarGramatura } from './_lib.js'
import { chaveGrupo, recalcularGrupo } from '../cafe-cru/_lib.js'
import { recalcularTorrado } from '../torrado/_lib.js'
import { recalcularInsumo } from '../insumos/_lib.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, ['GET', 'POST'])) return

  try {
    if (req.method === 'GET') {
      const ordens = await sql`SELECT * FROM ordens_producao ORDER BY data ASC, id ASC`
      return enviarJson(res, 200, { ordens })
    }

    const b = await lerCorpo(req)
    const data = b.data || new Date().toISOString().slice(0, 10)
    const calc = await calcularOrdem(b)
    const pa = calc.pa
    const descBase = `Produção ${data} — ${pa?.nome || 'PA'}`

    // (a) baixa cada lote de café cru + saída no kardex do cru
    const lotesUsados = []
    for (const l of calc.lotes) {
      const novoSaldo = Math.max(0, (Number(l.saldoDisponivel) || 0) - l.kg)
      await sql`
        UPDATE lotes_cafe_cru
           SET saldo_disponivel = ${novoSaldo}, status = ${novoSaldo > 0 ? 'disponivel' : 'esgotado'}
         WHERE id = ${l.loteId}
      `
      const grupo = chaveGrupo(l.produtor, l.variedade)
      const mov = await sql`
        INSERT INTO kardex_cafe_cru
          (data, tipo, descricao, produtor, variedade, grupo, quantidade,
           custo_unitario, custo_total, saldo_acumulado, custo_medio, lote_id)
        VALUES (${data}, ${TIPOS_MOV.SAIDA}, ${descBase}, ${l.produtor}, ${l.variedade},
                ${grupo}, ${-l.kg}, ${l.custoPorKg}, 0, 0, 0, ${l.loteId})
        RETURNING id
      `
      await recalcularGrupo(grupo)
      lotesUsados.push({ ...l, movCruId: mov[0].id })
    }

    // (b) sobra torrada → entrada no kardex do torrado com custo ZERO
    let movTorradoId = null
    if (calc.sobra > 0) {
      const mt = await sql`
        INSERT INTO kardex_cafe_torrado
          (data, tipo, descricao, quantidade, custo_unitario, custo_total, saldo_acumulado, custo_medio)
        VALUES (${data}, ${TIPOS_MOV.ENTRADA}, ${`${descBase} — sobra de torra (custo zero)`},
                ${calc.sobra}, 0, 0, 0, 0)
        RETURNING id
      `
      await recalcularTorrado()
      movTorradoId = mt[0].id
    }

    // Cria a ordem (para obter o id) — lotes/itens preenchidos ao final.
    const ordemRows = await sql`
      INSERT INTO ordens_producao
        (data, pa_id, pa_nome, total_cru, custo_total_cru, total_kg_embalado, custo_kg_embalado,
         sobra, perda, custo_total_cafe, custo_total_embalagens, custo_total, mov_torrado_id, lotes, itens)
      VALUES (${data}, ${pa?.id ?? null}, ${pa?.nome || ''}, ${calc.totalCru}, ${calc.custoTotalCru},
              ${calc.totalKgEmbalado}, ${calc.custoKgEmbalado}, ${calc.sobra}, ${calc.perda},
              ${calc.custoTotalCafe}, ${calc.custoTotalEmbalagens}, ${calc.custoTotalGeral},
              ${movTorradoId}, '[]'::jsonb, '[]'::jsonb)
      RETURNING id
    `
    const ordemId = ordemRows[0].id

    // (c/d) por gramatura: baixa embalagem + registra estoque/movimentação de PA
    const itensOrdem = []
    for (const it of calc.itens) {
      let movInsumoId = null
      if (it.embalagemId && it.quantidade > 0) {
        const mi = await sql`
          INSERT INTO kardex_insumos
            (insumo_id, data, tipo, descricao, quantidade, custo_unitario, custo_total, saldo_acumulado, custo_medio)
          VALUES (${it.embalagemId}, ${data}, ${TIPOS_MOV.SAIDA},
                  ${`${descBase} ${formatarGramatura(it.gramatura)}`}, ${-it.quantidade}, 0, 0, 0, 0)
          RETURNING id
        `
        await recalcularInsumo(it.embalagemId)
        movInsumoId = mi[0].id
      }

      const est = await sql`
        INSERT INTO pa_estoque (pa_id, gramatura, quantidade, custo_unitario, custo_total, data, ordem_id)
        VALUES (${pa?.id ?? null}, ${it.gramatura}, ${it.quantidade}, ${it.custoUnitarioTotal},
                ${it.custoTotalGramatura}, ${data}, ${ordemId})
        RETURNING id
      `
      const mov = await sql`
        INSERT INTO pa_movimentacoes
          (ordem_id, data, tipo, pa_id, pa_nome, gramatura, quantidade, custo_unitario, custo_total)
        VALUES (${ordemId}, ${data}, ${TIPOS_MOV.ENTRADA}, ${pa?.id ?? null}, ${pa?.nome || ''},
                ${it.gramatura}, ${it.quantidade}, ${it.custoUnitarioTotal}, ${it.custoTotalGramatura})
        RETURNING id
      `
      itensOrdem.push({
        gramatura: it.gramatura,
        quantidade: it.quantidade,
        embaladoKg: it.embaladoKg,
        embalagemId: it.embalagemId,
        embNome: it.embNome,
        custoUnitarioCafe: it.custoUnitarioCafe,
        custoUnitarioEmbalagem: it.custoUnitarioEmbalagem,
        custoUnitarioTotal: it.custoUnitarioTotal,
        custoTotalGramatura: it.custoTotalGramatura,
        movInsumoId,
        paEstoqueId: est[0].id,
        paMovId: mov[0].id,
      })
    }

    // Preenche lotes/itens na ordem.
    await sql`
      UPDATE ordens_producao
         SET lotes = ${JSON.stringify(lotesUsados)}::jsonb, itens = ${JSON.stringify(itensOrdem)}::jsonb
       WHERE id = ${ordemId}
    `
    const ordemFinal = await sql`SELECT * FROM ordens_producao WHERE id = ${ordemId} LIMIT 1`
    return enviarJson(res, 201, { ordem: ordemFinal[0] })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao registrar a ordem: ${erro?.message || erro}`)
  }
}
