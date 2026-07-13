// GET  /api/inventario → lista os inventários
// POST /api/inventario → cria um inventário (Rascunho) com itens gerados do sistema
//   Corpo: { tipo, criadoPor }

import { sql } from './db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from './_http.js'
import { TIPOS_INVENTARIO, gerarItensSistema } from './inventario/_lib.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, ['GET', 'POST'])) return

  try {
    if (req.method === 'GET') {
      const inventarios = await sql`SELECT * FROM inventarios ORDER BY id DESC`
      return enviarJson(res, 200, { inventarios })
    }

    const b = await lerCorpo(req)
    const tipo = TIPOS_INVENTARIO.includes(b.tipo) ? b.tipo : 'Diário'
    const criadoPor = b.criadoPor || 'sistema'
    const data = b.data || new Date().toISOString().slice(0, 10)
    const itens = await gerarItensSistema()

    const linhas = await sql`
      INSERT INTO inventarios (data, tipo, status, criado_por, concluido_em, itens)
      VALUES (${data}, ${tipo}, 'Rascunho', ${criadoPor}, NULL, ${JSON.stringify(itens)}::jsonb)
      RETURNING *
    `
    return enviarJson(res, 201, { inventario: linhas[0] })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao processar inventários: ${erro?.message || erro}`)
  }
}
