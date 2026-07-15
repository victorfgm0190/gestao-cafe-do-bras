// Configuração e verificação de estoque mínimo — cliente async da API.
// Config em api/config/estoque-minimo; saldos vêm dos resumos de cada módulo.

import { getJson, sendJson } from './api'
import { carregarCadastro as carregarInsumos, resumoPorInsumo } from './insumos'
import { carregarEstoqueTorrado } from './torrado'
import { carregarPA, resumoPAEstoque, formatarGramatura } from './pa'

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

export async function carregarConfig() {
  const d = await getJson('/api/config/estoque-minimo')
  return d.config || {}
}
export async function salvarConfig(cfg) {
  await sendJson('/api/config/estoque-minimo', 'PUT', { config: cfg || {} })
}

// Lista todos os itens monitoráveis com saldo atual e mínimo (config ou padrão).
export async function itensMonitoraveis() {
  const [cfg, insumos, resumoIns, torr, pas, estoquePA] = await Promise.all([
    carregarConfig(),
    carregarInsumos(),
    resumoPorInsumo(),
    carregarEstoqueTorrado(),
    carregarPA(),
    resumoPAEstoque(),
  ])
  const itens = []

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

  const chaveT = chaveTorrado()
  itens.push({
    chave: chaveT,
    tipo: 'Café torrado',
    nome: 'Café torrado a granel',
    unidade: 'kg',
    saldoAtual: Number(torr.saldoAtual) || 0,
    minimo: chaveT in cfg ? Number(cfg[chaveT]) || 0 : MIN_TORRADO_PADRAO,
  })

  // Saldo é casado pelo RÓTULO da gramatura (coluna TEXT: "250g", "Drip (10g)"),
  // mas a chave de config continua pelo identificador (pa:<id>:<250|drip>) para
  // não invalidar mínimos já salvos.
  const saldoPA = {}
  for (const r of estoquePA) saldoPA[`${r.paId}:${formatarGramatura(r.gramatura)}`] = r.quantidade
  for (const p of pas) {
    for (const g of p.gramaturas || []) {
      const chave = chavePA(p.id, g)
      itens.push({
        chave,
        tipo: 'Produto acabado',
        nome: `${p.nome} ${formatarGramatura(g)}`,
        unidade: 'un',
        saldoAtual: Number(saldoPA[`${p.id}:${formatarGramatura(g)}`]) || 0,
        minimo: chave in cfg ? Number(cfg[chave]) || 0 : 0,
      })
    }
  }

  return itens
}

// Itens cujo saldo está abaixo do mínimo configurado (mínimo > 0).
export async function itensAbaixo() {
  const itens = await itensMonitoraveis()
  return itens.filter((it) => it.minimo > 0 && it.saldoAtual < it.minimo)
}
