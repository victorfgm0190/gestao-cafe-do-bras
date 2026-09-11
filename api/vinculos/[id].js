// GET    /api/vinculos/:id → o vínculo com a lista de impactos
// DELETE /api/vinculos/:id → desfaz: devolve cada registro ao valor_antes
//        gravado em vinculo_impacto, marca o vínculo CANCELADO e o boleto
//        volta para SEM_VINCULO.
//
// O desfazer existe porque a cascata reescreve custo de estoque já produzido.
// Ele só consegue restaurar porque vinculo_impacto guarda antes/depois de cada
// linha tocada — é o que torna a operação reversível.

import { sql, transacao } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo } from '../_http.js'
import { exigirPermissao, registrarAudit } from '../_auth.js'
import { chaveGrupo, recalcularGrupo } from '../cafe-cru/_lib.js'

const MODULO = 'Contas a Pagar'
const q2 = (v) => Math.round(Number(v) * 100) / 100

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, ['GET', 'DELETE'])) return
  const autorizado = await exigirPermissao(req, res, MODULO)
  if (!autorizado) return

  const id = Number(req.query?.id)
  if (!Number.isInteger(id) || id <= 0) return enviarErro(res, 400, 'Id de vínculo inválido.')

  try {
    const [vinculo] = await sql`
      SELECT v.*, l.fazenda, l.variedade, l.peso_kg, l.codigo_lote
        FROM vinculos v
        JOIN lotes_cafe_cru l ON l.id = v.cafe_cru_lote_id
       WHERE v.id = ${id} LIMIT 1
    `
    if (!vinculo) return enviarErro(res, 404, 'Vínculo não encontrado.')

    const impactos = await sql`
      SELECT id, tabela_afetada, registro_id_afetado, valor_antes, valor_depois, criado_em
        FROM vinculo_impacto WHERE vinculo_id = ${id} ORDER BY id
    `

    if (req.method === 'GET') {
      return enviarJson(res, 200, { vinculo, impactos })
    }

    if (vinculo.status === 'CANCELADO') {
      return enviarJson(res, 200, { vinculo, impactos, mensagem: 'Vínculo já estava cancelado.' })
    }

    const passos = []
    let restaurados = 0

    for (const i of impactos) {
      const antes = Number(i.valor_antes)
      const alvo = i.registro_id_afetado

      if (i.tabela_afetada === 'pa_estoque') {
        // custo_total é recalculado pela quantidade atual da linha.
        passos.push(sql`
          UPDATE pa_estoque
             SET custo_unitario = ${antes},
                 custo_total = ROUND(${antes}::numeric * quantidade, 2)
           WHERE id = ${alvo}
        `)
        restaurados++
      } else if (i.tabela_afetada === 'lotes_cafe_cru') {
        passos.push(sql`
          UPDATE lotes_cafe_cru
             SET preco_kg = ${antes},
                 custo_total = ROUND(${antes}::numeric * peso_kg, 2)
           WHERE id = ${alvo}
        `)
        restaurados++
      } else if (i.tabela_afetada === 'kardex_cafe_cru') {
        passos.push(sql`
          UPDATE kardex_cafe_cru SET custo_unitario = ${antes} WHERE id = ${alvo}
        `)
        restaurados++
      } else if (i.tabela_afetada === 'boletos') {
        // 0 = SEM_VINCULO (a codificação usada no POST).
        passos.push(sql`
          UPDATE boletos
             SET status = ${antes === 0 ? 'SEM_VINCULO' : 'VINCULADO'}, atualizado_em = NOW()
           WHERE id = ${alvo}
        `)
        restaurados++
      }
    }

    passos.push(sql`
      UPDATE vinculos SET status = 'CANCELADO', atualizado_em = NOW() WHERE id = ${id}
    `)

    await transacao(passos)

    // O kardex voltou ao custo anterior: refaz a média do grupo.
    const grupo = chaveGrupo(vinculo.fazenda, vinculo.variedade)
    const resumoGrupo = await recalcularGrupo(grupo)

    await registrarAudit({
      usuario: autorizado.nome,
      acao: 'Cancelou',
      modulo: MODULO,
      detalhes: `Vínculo #${id} desfeito: ${restaurados} registro(s) devolvidos ao valor anterior (lote ${vinculo.codigo_lote})`,
    })

    const [atualizado] = await sql`SELECT * FROM vinculos WHERE id = ${id}`
    return enviarJson(res, 200, {
      vinculo: atualizado,
      restaurados,
      grupo: { chave: grupo, custo_medio: q2(resumoGrupo.custoMedio) },
      mensagem: `Vínculo desfeito. ${restaurados} registro(s) restaurados.`,
    })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao processar o vínculo: ${erro?.message || erro}`)
  }
}
