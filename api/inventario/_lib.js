// Lógica de negócio do inventário inteligente.
// Arquivos começando com "_" NÃO viram rotas na Vercel.

import { sql } from '../db.js'
import { resumoTorrado } from '../torrado/_lib.js'
import { resumoPAEstoque, formatarGramatura } from '../pa/_lib.js'
import { resumoPorInsumo } from '../insumos/_lib.js'
import { chaveGrupo } from '../cafe-cru/_lib.js'
import { garantirTabelaCafes } from '../cafe-cru/cadastro.js'

export const TIPOS_INVENTARIO = ['Diário', 'Semanal', 'Mensal']

export const CATEGORIAS = {
  CRU: 'cafe_cru',
  TORRADO: 'cafe_torrado',
  EMBALADO: 'produto_embalado',
  INSUMO: 'insumo',
}

export function calcularItem(base) {
  const saldoSistema = Number(base.saldoSistema) || 0
  const saldoFisico = base.saldoFisico == null ? saldoSistema : Number(base.saldoFisico) || 0
  const diferenca = saldoFisico - saldoSistema
  const status = diferenca > 1e-9 ? 'sobra' : diferenca < -1e-9 ? 'falta' : 'ok'
  return { ...base, saldoSistema, saldoFisico, diferenca, status }
}

// Monta os itens a partir dos saldos atuais do sistema (todos os módulos).
export async function gerarItensSistema() {
  const itens = []

  // Café cru — TODOS os lotes existentes (mesmo com saldo zero), por lote.
  const lotes = await sql`SELECT * FROM lotes_cafe_cru ORDER BY id ASC`
  const gruposComLote = new Set()
  for (const l of lotes) {
    gruposComLote.add(chaveGrupo(l.fazenda, l.variedade))
    itens.push(
      calcularItem({
        categoria: CATEGORIAS.CRU,
        referencia: l.codigo_lote || `#${l.id}`,
        descricao: `${l.fazenda || '—'}${l.variedade ? ' / ' + l.variedade : ''}`,
        unidade: 'kg',
        saldoSistema: Number(l.saldo_disponivel) || 0,
        saldoFisico: null,
        regularizado: false,
        regularizacao: null,
        loteId: l.id,
        loteCodigo: l.codigo_lote || '',
        produtor: l.fazenda || '',
        variedade: l.variedade || '',
      }),
    )
  }

  // Cafés cadastrados (ativos) SEM nenhum lote → linha com saldo 0, depois dos lotes.
  await garantirTabelaCafes()
  const cafes = await sql`
    SELECT * FROM cafes_cru_cadastro WHERE ativo = true ORDER BY fazenda ASC, variedade ASC
  `
  for (const c of cafes) {
    if (gruposComLote.has(chaveGrupo(c.fazenda, c.variedade))) continue
    const rotulo = `Sem lotes — ${c.fazenda || '—'} / ${c.variedade || '—'}`
    itens.push(
      calcularItem({
        categoria: CATEGORIAS.CRU,
        referencia: rotulo,
        descricao: rotulo,
        unidade: 'kg',
        saldoSistema: 0,
        saldoFisico: null,
        regularizado: false,
        regularizacao: null,
        loteId: null,
        loteCodigo: '',
        cafeId: c.id,
        produtor: c.fazenda || '',
        variedade: c.variedade || '',
        semLotes: true,
      }),
    )
  }

  // Café torrado a granel
  const torr = await resumoTorrado()
  if ((Number(torr.saldoAtual) || 0) > 0) {
    itens.push(
      calcularItem({
        categoria: CATEGORIAS.TORRADO,
        referencia: 'Café torrado',
        descricao: 'Café torrado a granel',
        unidade: 'kg',
        saldoSistema: Number(torr.saldoAtual) || 0,
        saldoFisico: null,
        regularizado: false,
        regularizacao: null,
      }),
    )
  }

  // Produtos embalados (por produto + gramatura)
  const pa = await resumoPAEstoque()
  for (const r of pa) {
    if ((Number(r.quantidade) || 0) <= 0) continue
    itens.push(
      calcularItem({
        categoria: CATEGORIAS.EMBALADO,
        referencia: `${r.paNome} ${formatarGramatura(r.gramatura)}`,
        descricao: `${r.paNome} — ${formatarGramatura(r.gramatura)}`,
        unidade: 'un',
        saldoSistema: Number(r.quantidade) || 0,
        saldoFisico: null,
        regularizado: false,
        regularizacao: null,
        paId: r.paId,
        gramatura: r.gramatura,
        paNome: r.paNome,
      }),
    )
  }

  // Insumos
  const insumos = await sql`SELECT * FROM insumos_cadastro ORDER BY id ASC`
  const resumoIns = await resumoPorInsumo()
  for (const i of insumos) {
    const saldo = Number(resumoIns[i.id]?.saldoAtual) || 0
    if (saldo <= 0) continue
    itens.push(
      calcularItem({
        categoria: CATEGORIAS.INSUMO,
        referencia: i.nome,
        descricao: i.nome,
        unidade: i.unidade || 'un',
        saldoSistema: saldo,
        saldoFisico: null,
        regularizado: false,
        regularizacao: null,
        insumoId: i.id,
      }),
    )
  }

  return itens
}

export function resumoInventario(inv) {
  let ok = 0
  let sobras = 0
  let faltas = 0
  let pendentes = 0
  for (const it of inv.itens || []) {
    if (it.status === 'ok') ok++
    else {
      if (it.status === 'sobra') sobras++
      if (it.status === 'falta') faltas++
      if (!it.regularizado) pendentes++
    }
  }
  return {
    ok,
    sobras,
    faltas,
    comDiferenca: sobras + faltas,
    pendentes,
    total: (inv.itens || []).length,
    tudoRegularizado: pendentes === 0,
  }
}
