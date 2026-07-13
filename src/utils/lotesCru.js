// Cliente da API de lotes de café cru (substitui o localStorage 'cafe_do_bras_estoque').
// Centraliza a leitura/escrita dos lotes usada por EntradaCafe, torrado.js e pa.js.

import { getJson, sendJson } from './api'

const n = (v) => Number(v) || 0

// API (snake_case) → app (camelCase). fazenda = produtor.
export function mapLote(r) {
  if (!r) return null
  return {
    id: r.id,
    codigo: r.codigo_lote || '',
    recebimento: typeof r.data_entrada === 'string' ? r.data_entrada.slice(0, 10) : r.data_entrada,
    tipoEntrada: r.tipo_entrada || '',
    sacas: n(r.sacas),
    pesoTotal: n(r.peso_kg),
    tipoCafe: r.tipo_cafe || '',
    produtor: r.fazenda || '',
    cidade: r.cidade || '',
    estado: r.estado || '',
    variedade: r.variedade || '',
    processo: r.processo || '',
    safra: r.safra || '',
    qualidade: r.qualidade || '',
    umidade: r.umidade || '',
    custoTotal: n(r.custo_total),
    custoPorKg: n(r.preco_kg),
    notaFiscal: r.nota_fiscal || '',
    fornecedor: r.fornecedor || '',
    deposito: r.deposito || '',
    saldoDisponivel: n(r.saldo_disponivel),
    status: r.status || 'disponivel',
    observacoes: r.observacoes || '',
  }
}

export async function carregarLotesCru() {
  const data = await getJson('/api/cafe-cru/lotes')
  return (data.lotes || []).map(mapLote)
}

export async function loteCruPorId(id) {
  const data = await getJson(`/api/cafe-cru/lotes/${id}`)
  return mapLote(data.lote)
}

export async function lotesCruDisponiveis() {
  const lotes = await carregarLotesCru()
  return lotes.filter((l) => (Number(l.saldoDisponivel) || 0) > 0)
}

// Cria um lote (o backend gera o código LC-AAAA-NNN e lança a ENTRADA no kardex).
// O endpoint aceita os campos camelCase do formulário (produtor, pesoTotal, etc.).
export async function criarLoteCru(dados) {
  const data = await sendJson('/api/cafe-cru/lotes', 'POST', dados)
  return mapLote(data.lote)
}

// Edita o lote (o backend sincroniza a ENTRADA no kardex, recalcula o grupo e
// devolve o relatório de impacto). Retorna a resposta completa da API.
export async function editarLoteCru(id, dados) {
  return sendJson(`/api/cafe-cru/lotes/${id}`, 'PUT', dados)
}

export async function excluirLoteCru(id) {
  await sendJson(`/api/cafe-cru/lotes/${id}`, 'DELETE')
}

// Atualiza só o saldo disponível de um lote (consumo/estorno por torra/produção).
export async function atualizarSaldoLote(id, saldoDisponivel, status) {
  await sendJson(`/api/cafe-cru/lotes/${id}/saldo`, 'POST', { saldoDisponivel, status })
}
