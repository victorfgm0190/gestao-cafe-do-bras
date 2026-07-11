// Orquestrador do recálculo em cascata do café cru.
//
// Ao editar uma entrada de café cru:
//   1. O ledger do grupo (fazenda + variedade) é reprocessado do zero (kardex).
//   2. As ordens de produção que consumiram café desse grupo têm seus custos recalculados.
//   (3. Ponto de extensão: vendas entrarão aqui futuramente.)

import { editarEntrada, acharEntradaPorCodigo } from './kardex'
import { ordensDoGrupo, recalcularOrdemProducao } from './pa'

// Edita uma entrada (por id da movimentação no kardex) e propaga o recálculo.
// Retorna o relatório completo de impacto.
export function editarEntradaCafeCru(id, campos) {
  const kardexRel = editarEntrada(id, campos)

  const { produtor, variedade } = kardexRel.entrada
  const ordens = ordensDoGrupo(produtor, variedade)
    .map((o) => recalcularOrdemProducao(o.id))
    .filter(Boolean)
    .filter((r) => r.itens.some((it) => Math.abs(it.custoUnitarioDepois - it.custoUnitarioAntes) > 1e-6))

  // PONTO DE EXTENSÃO: recalcular vendas do grupo aqui no futuro.

  return { ...kardexRel, ordens }
}

// Variante por código de lote (usada pela tela de Entrada de café cru).
export function editarEntradaPorLote(codigo, campos) {
  const mov = acharEntradaPorCodigo(codigo)
  if (!mov) return null
  return editarEntradaCafeCru(mov.id, campos)
}
