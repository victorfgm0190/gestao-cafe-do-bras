// GET  /api/cafe-cru/lotes        → lista todos os lotes
// POST /api/cafe-cru/lotes        → cria um lote E lança a ENTRADA no kardex
//
// Criar lote é atômico com o kardex: espelha o comportamento do app
// (EntradaCafe.jsx grava o lote e chama registrarMovimentacao de ENTRADA).

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../_http.js'
import { TIPOS_MOV, chaveGrupo, proximoCodigoLote, recalcularGrupo } from './_lib.js'

const num = (v) => Number(String(v ?? '').replace(',', '.')) || 0

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, ['GET', 'POST'])) return

  try {
    if (req.method === 'GET') {
      const lotes = await sql`
        SELECT * FROM lotes_cafe_cru
         ORDER BY data_entrada DESC, id DESC
      `
      return enviarJson(res, 200, { lotes })
    }

    // POST — cria lote
    const b = await lerCorpo(req)
    const produtor = String(b.produtor || '').trim()
    const variedade = String(b.variedade || '').trim()
    const peso = num(b.pesoTotal ?? b.peso_kg)
    if (!produtor || !variedade) {
      return enviarErro(res, 400, 'produtor e variedade são obrigatórios.')
    }
    if (peso <= 0) {
      return enviarErro(res, 400, 'pesoTotal deve ser maior que zero.')
    }

    const dataEntrada = b.recebimento || b.data_entrada || new Date().toISOString().slice(0, 10)
    const custoTotal = num(b.custoTotal ?? b.custo_total)
    const precoKg = num(b.custoPorKg ?? b.preco_kg) || (peso > 0 ? custoTotal / peso : 0)
    const codigo = await proximoCodigoLote(dataEntrada)
    const grupo = chaveGrupo(produtor, variedade)

    // (a) grava o lote
    const inseridos = await sql`
      INSERT INTO lotes_cafe_cru
        (codigo_lote, data_entrada, tipo_entrada, sacas, peso_kg, tipo_cafe,
         fazenda, cidade, estado, variedade, processo, safra, qualidade, umidade,
         custo_total, preco_kg, nota_fiscal, fornecedor, deposito,
         saldo_disponivel, status, observacoes)
      VALUES
        (${codigo}, ${dataEntrada}, ${b.tipoEntrada || null}, ${num(b.sacas) || null},
         ${peso}, ${b.tipoCafe || null}, ${produtor}, ${b.cidade || null},
         ${b.estado ? String(b.estado).toUpperCase().slice(0, 2) : null}, ${variedade},
         ${b.processo || null}, ${b.safra || null}, ${b.qualidade || null},
         ${b.umidade || null}, ${custoTotal}, ${precoKg}, ${b.notaFiscal || null},
         ${b.fornecedor || null}, ${b.deposito || null}, ${peso}, 'disponivel',
         ${b.observacoes || null})
      RETURNING *
    `
    const lote = inseridos[0]

    // (b) lança a ENTRADA no kardex, vinculada ao lote
    await sql`
      INSERT INTO kardex_cafe_cru
        (data, tipo, descricao, produtor, variedade, grupo, quantidade,
         custo_unitario, custo_total, saldo_acumulado, custo_medio, lote_id)
      VALUES
        (${dataEntrada}, ${TIPOS_MOV.ENTRADA}, ${`${codigo} — ${produtor}`},
         ${produtor}, ${variedade}, ${grupo}, ${peso}, ${precoKg}, 0, 0, 0, ${lote.id})
    `

    // (c) reprocessa o grupo (saldo e custo médio corridos)
    const resumo = await recalcularGrupo(grupo)

    return enviarJson(res, 201, { lote, resumoGrupo: resumo })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao processar lotes: ${erro?.message || erro}`)
  }
}
