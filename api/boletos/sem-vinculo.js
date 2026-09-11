// GET /api/boletos/sem-vinculo → boletos que ainda podem ser vinculados a um
// lote de café cru / insumo. Usa o índice idx_boletos_status.
// Sem paginação de propósito: é a lista que alimenta o seletor da tela de
// vínculo, e ela some conforme os boletos vão sendo vinculados.

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo } from '../_http.js'
import { exigirPermissao } from '../_auth.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'GET')) return
  const autorizado = await exigirPermissao(req, res, 'Contas a Pagar')
  if (!autorizado) return

  try {
    const boletos = await sql`
      SELECT id, fornecedor, data_entrada, valor_total, parcelas_quantidade,
             valor_parcela, status, observacoes, criado_em
        FROM boletos
       WHERE status = 'SEM_VINCULO'
         AND excluido_em IS NULL
       ORDER BY criado_em DESC, id DESC
    `
    return enviarJson(res, 200, { boletos, total: boletos.length })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao listar boletos sem vínculo: ${erro?.message || erro}`)
  }
}
