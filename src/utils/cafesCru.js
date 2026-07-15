// Cliente da API de cadastro formal de cafés cru (MP) — api/cafe-cru/cadastro.
// Catálogo canônico de fazenda + variedade + processo, com vínculo opcional a PAs.

import { getJson, sendJson } from './api'

export const PROCESSOS_CAFE = ['Natural', 'Lavado', 'Honey']

// API (snake_case) → app (camelCase).
export function mapCafeCru(r) {
  return (
    r && {
      id: r.id,
      fazenda: r.fazenda || '',
      variedade: r.variedade || '',
      processo: r.processo || 'Natural',
      paIds: Array.isArray(r.pa_ids) ? r.pa_ids.map(Number).filter(Number.isFinite) : [],
      ativo: r.ativo !== false,
    }
  )
}

export async function carregarCafesCru() {
  const d = await getJson('/api/cafe-cru/cadastro')
  return (d.cafes || []).map(mapCafeCru)
}
export async function criarCafeCru(dados) {
  const d = await sendJson('/api/cafe-cru/cadastro', 'POST', dados)
  return mapCafeCru(d.cafe)
}
export async function editarCafeCru(id, dados) {
  const d = await sendJson(`/api/cafe-cru/cadastro/${id}`, 'PUT', dados)
  return mapCafeCru(d.cafe)
}
// Inativa (ativo = false) — preserva o histórico e os vínculos.
export async function inativarCafeCru(id) {
  await sendJson(`/api/cafe-cru/cadastro/${id}`, 'DELETE')
}
