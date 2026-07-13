// Orquestrador do recálculo em cascata do café cru (agora assíncrono).
//
// Ao editar uma entrada de café cru:
//   1. O ledger do grupo (fazenda + variedade) é reprocessado no backend (kardex).
//   2. As ordens de produção que consumiram café desse grupo têm seus custos recalculados.
//   (3. Ponto de extensão: vendas entrarão aqui futuramente.)

import { editarEntrada, acharEntradaPorCodigo } from './kardex'
import { ordensDoGrupo, recalcularOrdemProducao } from './pa'

// Recalcula as ordens de produção que consumiram café de um grupo
// (fazenda + variedade) e devolve apenas as ordens efetivamente afetadas.
export async function recalcularOrdensDoGrupo(produtor, variedade) {
  const recalculadas = await Promise.all(
    ordensDoGrupo(produtor, variedade).map((o) => recalcularOrdemProducao(o.id)),
  )
  return recalculadas
    .filter(Boolean)
    .filter((r) => r.itens.some((it) => Math.abs(it.custoUnitarioDepois - it.custoUnitarioAntes) > 1e-6))

  // PONTO DE EXTENSÃO: recalcular vendas do grupo aqui no futuro.
}

// Edita uma entrada (por id da movimentação no kardex) e propaga o recálculo.
// Retorna o relatório completo de impacto.
export async function editarEntradaCafeCru(id, campos) {
  const kardexRel = await editarEntrada(id, campos)
  const { produtor, variedade } = kardexRel.entrada
  const ordens = await recalcularOrdensDoGrupo(produtor, variedade)
  return { ...kardexRel, ordens }
}

// Variante por código de lote (usada pela tela de Entrada de café cru).
export async function editarEntradaPorLote(codigo, campos) {
  const mov = await acharEntradaPorCodigo(codigo)
  if (!mov) return null
  return editarEntradaCafeCru(mov.id, campos)
}
