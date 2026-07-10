// Configuração e verificação de estoque mínimo dos itens monitoráveis.
//
// localStorage "config_estoque_minimo": { [chave]: valorMinimo }
//   chaves: insumo:{id} | torrado | pa:{paId}:{gramatura}

import { carregarCadastro as carregarInsumos, resumoPorInsumo } from './insumos'
import { carregarEstoqueTorrado } from './torrado'
import { carregarPA, resumoPAEstoque, formatarGramatura } from './pa'

const CHAVE = 'config_estoque_minimo'
const MIN_TORRADO_PADRAO = 10 // kg

export function chaveInsumo(id) {
  return `insumo:${id}`
}
export function chaveTorrado() {
  return 'torrado'
}
export function chavePA(paId, gramatura) {
  return `pa:${paId}:${gramatura}`
}

export function carregarConfig() {
  try {
    const bruto = localStorage.getItem(CHAVE)
    const dado = bruto ? JSON.parse(bruto) : {}
    return dado && typeof dado === 'object' ? dado : {}
  } catch {
    return {}
  }
}

export function salvarConfig(cfg) {
  localStorage.setItem(CHAVE, JSON.stringify(cfg || {}))
}

// Lista todos os itens monitoráveis com saldo atual e mínimo (config ou padrão).
export function itensMonitoraveis() {
  const cfg = carregarConfig()
  const itens = []

  // Insumos
  const insumos = carregarInsumos()
  const resumoIns = resumoPorInsumo()
  for (const i of insumos) {
    const chave = chaveInsumo(i.id)
    const padrao = Number(i.estoqueMinimo) || 0
    itens.push({
      chave,
      tipo: 'Insumo',
      nome: i.nome,
      unidade: i.unidade || 'un',
      saldoAtual: Number(resumoIns[i.id]?.saldoAtual) || 0,
      minimo: chave in cfg ? Number(cfg[chave]) || 0 : padrao,
    })
  }

  // Café torrado a granel
  const t = carregarEstoqueTorrado()
  const chaveT = chaveTorrado()
  itens.push({
    chave: chaveT,
    tipo: 'Café torrado',
    nome: 'Café torrado a granel',
    unidade: 'kg',
    saldoAtual: Number(t.saldoAtual) || 0,
    minimo: chaveT in cfg ? Number(cfg[chaveT]) || 0 : MIN_TORRADO_PADRAO,
  })

  // Produtos acabados por gramatura
  const pas = carregarPA()
  const estoquePA = resumoPAEstoque()
  const saldoPA = {}
  for (const r of estoquePA) saldoPA[`${r.paId}:${r.gramatura}`] = r.quantidade
  for (const p of pas) {
    for (const g of p.gramaturas || []) {
      const chave = chavePA(p.id, g)
      itens.push({
        chave,
        tipo: 'Produto acabado',
        nome: `${p.nome} ${formatarGramatura(g)}`,
        unidade: 'un',
        saldoAtual: Number(saldoPA[`${p.id}:${g}`]) || 0,
        minimo: chave in cfg ? Number(cfg[chave]) || 0 : 0,
      })
    }
  }

  return itens
}

// Itens cujo saldo está abaixo do mínimo configurado (mínimo > 0).
export function itensAbaixo() {
  return itensMonitoraveis().filter((it) => it.minimo > 0 && it.saldoAtual < it.minimo)
}
