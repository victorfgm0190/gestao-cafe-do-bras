// PUT    /api/pa/cadastro/:id → edita um produto acabado
// DELETE /api/pa/cadastro/:id → remove um produto acabado

import { sql } from '../../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../../_http.js'

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, ['PUT', 'DELETE'])) return

  const id = Number(req.query.id)
  if (!Number.isFinite(id)) return enviarErro(res, 400, 'id inválido.')

  try {
    // Colunas do mix de projeção e origem do café (migração idempotente).
    await sql`ALTER TABLE pa_cadastro ADD COLUMN IF NOT EXISTS mix_projecao jsonb`
    await sql`ALTER TABLE pa_cadastro ADD COLUMN IF NOT EXISTS cafe_origem_ids jsonb`

    const existentes = await sql`SELECT * FROM pa_cadastro WHERE id = ${id} LIMIT 1`
    const pa = existentes[0]
    if (!pa) return enviarErro(res, 404, 'Produto não encontrado.')

    if (req.method === 'DELETE') {
      await sql`DELETE FROM pa_cadastro WHERE id = ${id}`
      return enviarJson(res, 200, { deleted: true, id })
    }

    const b = await lerCorpo(req)
    const gramaturas = Array.isArray(b.gramaturas) ? b.gramaturas.map(Number) : pa.gramaturas
    const perda =
      b.perdaTorraPadrao !== undefined
        ? Number(String(b.perdaTorraPadrao).replace(',', '.')) || 0
        : pa.perda_torra_padrao
    // jsonb do banco volta como objeto JS já parseado → re-serializa ao manter o valor atual.
    const mixProjecao =
      b.mixProjecao !== undefined
        ? b.mixProjecao && typeof b.mixProjecao === 'object'
          ? JSON.stringify(b.mixProjecao)
          : null
        : pa.mix_projecao != null
          ? JSON.stringify(pa.mix_projecao)
          : null
    const cafeOrigemIds =
      b.cafeOrigemIds !== undefined
        ? Array.isArray(b.cafeOrigemIds)
          ? JSON.stringify(b.cafeOrigemIds)
          : null
        : pa.cafe_origem_ids != null
          ? JSON.stringify(pa.cafe_origem_ids)
          : null
    const linhas = await sql`
      UPDATE pa_cadastro SET
        nome = ${b.nome !== undefined ? String(b.nome).trim() : pa.nome},
        gramaturas = ${JSON.stringify(gramaturas)}::jsonb,
        embalagem_250_id = ${b.embalagem250Id !== undefined ? b.embalagem250Id : pa.embalagem_250_id},
        embalagem_1000_id = ${b.embalagem1000Id !== undefined ? b.embalagem1000Id : pa.embalagem_1000_id},
        ativo = ${b.ativo !== undefined ? !!b.ativo : pa.ativo},
        perda_torra_padrao = ${perda},
        mix_projecao = ${mixProjecao}::jsonb,
        cafe_origem_ids = ${cafeOrigemIds}::jsonb
      WHERE id = ${id}
      RETURNING *
    `
    return enviarJson(res, 200, { produto: linhas[0] })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao processar o produto: ${erro?.message || erro}`)
  }
}
