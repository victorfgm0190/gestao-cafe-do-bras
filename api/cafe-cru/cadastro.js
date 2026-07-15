// GET  /api/cafe-cru/cadastro → lista os cafés cru cadastrados (somente ativos)
// POST /api/cafe-cru/cadastro → cria um café cru (fazenda + variedade + processo)

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo, lerCorpo } from '../_http.js'

// Lista oficial de processos de café cru. O default é o primeiro item.
export const PROCESSOS = [
  'Natural (Via Seca)',
  'Cereja Descascado (CD / Pulped Natural)',
  'Honey White',
  'Honey Yellow',
  'Honey Red',
  'Honey Black',
  'Lavado (Washed)',
  'Semi-Lavado (Semi Washed)',
  'Wet Hulled (Giling Basah)',
  'Anaeróbico (Anaerobic Fermentation)',
  'Maceração Carbônica (Carbonic Maceration)',
  'Fermentação Aeróbica',
  'Fermentação Induzida por Leveduras (Yeast Fermentation)',
  'Fermentação Lática (Lactic Fermentation)',
  'Fermentação Prolongada (Extended Fermentation)',
  'Co-fermentado (Co-fermented)',
  'Fermentação Enzimática (Enzymatic Fermentation)',
  'Double Fermentation (Dupla Fermentação)',
  'Natural Anaeróbico',
  'Honey Anaeróbico',
  'Lavado Anaeróbico',
  'Frozen Cherry (Cereja Congelada)',
  'Cryo Process (Processamento Criogênico)',
  'Infused Coffee (Café Infusionado)',
  'Experimental Process (Processamento Experimental)',
]
export const PROCESSO_PADRAO = PROCESSOS[0]

// Cria a tabela do cadastro se ainda não existir (migração idempotente).
export async function garantirTabelaCafes() {
  await sql`
    CREATE TABLE IF NOT EXISTS cafes_cru_cadastro (
      id SERIAL PRIMARY KEY,
      fazenda TEXT NOT NULL,
      variedade TEXT NOT NULL,
      processo TEXT NOT NULL DEFAULT 'Natural',
      pa_ids JSONB,
      ativo BOOLEAN NOT NULL DEFAULT true,
      criado_em TIMESTAMPTZ DEFAULT NOW()
    )
  `
}

// Normaliza pa_ids para um array de inteiros; devolve null se a entrada não for
// um array (sinaliza "não mexer" no PUT) ou se ficar vazia.
export function normalizarPaIds(valor) {
  if (!Array.isArray(valor)) return null
  const ids = [...new Set(valor.map((v) => Number(v)).filter((n) => Number.isFinite(n)))]
  return ids.length ? ids : null
}

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, ['GET', 'POST'])) return

  try {
    await garantirTabelaCafes()

    if (req.method === 'GET') {
      const cafes = await sql`
        SELECT * FROM cafes_cru_cadastro WHERE ativo = true ORDER BY fazenda ASC, variedade ASC
      `
      return enviarJson(res, 200, { cafes })
    }

    const b = await lerCorpo(req)
    const fazenda = String(b.fazenda || '').trim()
    const variedade = String(b.variedade || '').trim()
    if (!fazenda) return enviarErro(res, 400, 'Informe a fazenda.')
    if (!variedade) return enviarErro(res, 400, 'Informe a variedade.')
    const processo = PROCESSOS.includes(b.processo) ? b.processo : PROCESSO_PADRAO
    const paIds = normalizarPaIds(b.paIds)
    const ativo = b.ativo !== undefined ? !!b.ativo : true

    const linhas = await sql`
      INSERT INTO cafes_cru_cadastro (fazenda, variedade, processo, pa_ids, ativo)
      VALUES (${fazenda}, ${variedade}, ${processo},
              ${paIds ? JSON.stringify(paIds) : null}::jsonb, ${ativo})
      RETURNING *
    `
    return enviarJson(res, 201, { cafe: linhas[0] })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao processar cadastro de café cru: ${erro?.message || erro}`)
  }
}
