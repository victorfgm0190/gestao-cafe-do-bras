// PUT    /api/cafe-cru/cadastro/:id → edita um café cru cadastrado
// DELETE /api/cafe-cru/cadastro/:id → inativa (ativo = false), preservando o histórico

import { sql } from '../../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../../_http.js'
import { PROCESSOS, garantirTabelaCafes, normalizarPaIds } from '../cadastro.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, ['PUT', 'DELETE'])) return

  const id = Number(req.query.id)
  if (!Number.isFinite(id)) return enviarErro(res, 400, 'id inválido.')

  try {
    await garantirTabelaCafes()

    const existentes = await sql`SELECT * FROM cafes_cru_cadastro WHERE id = ${id} LIMIT 1`
    const cafe = existentes[0]
    if (!cafe) return enviarErro(res, 404, 'Café não encontrado.')

    if (req.method === 'DELETE') {
      await sql`UPDATE cafes_cru_cadastro SET ativo = false WHERE id = ${id}`
      return enviarJson(res, 200, { inativado: true, id })
    }

    const b = await lerCorpo(req)
    const fazenda = b.fazenda !== undefined ? String(b.fazenda).trim() : cafe.fazenda
    const variedade = b.variedade !== undefined ? String(b.variedade).trim() : cafe.variedade
    if (!fazenda) return enviarErro(res, 400, 'Informe a fazenda.')
    if (!variedade) return enviarErro(res, 400, 'Informe a variedade.')
    const processo =
      b.processo !== undefined && PROCESSOS.includes(b.processo) ? b.processo : cafe.processo
    // jsonb do banco volta como array JS já parseado → re-serializa ao manter o valor atual.
    let paIds
    if (b.paIds !== undefined) {
      const ids = normalizarPaIds(b.paIds)
      paIds = ids ? JSON.stringify(ids) : null
    } else {
      paIds = cafe.pa_ids != null ? JSON.stringify(cafe.pa_ids) : null
    }
    const ativo = b.ativo !== undefined ? !!b.ativo : cafe.ativo

    const linhas = await sql`
      UPDATE cafes_cru_cadastro SET
        fazenda = ${fazenda},
        variedade = ${variedade},
        processo = ${processo},
        pa_ids = ${paIds}::jsonb,
        ativo = ${ativo}
      WHERE id = ${id}
      RETURNING *
    `
    return enviarJson(res, 200, { cafe: linhas[0] })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao processar o café: ${erro?.message || erro}`)
  }
}
