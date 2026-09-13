// Testes das regras de boleto que não dependem do banco.
// Rodar: node api/boletos/_lib.test.mjs
// Usa node:test (embutido no Node) — o projeto não tem jest nem supertest.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  montarBoleto,
  montarEdicao,
  centavos,
  MAX_PARCELAS,
  hojeLocal,
  montarVencimentos,
  vencimentosForaDeOrdem,
} from './_lib.js'

// Soma das parcelas como o SQL as grava: (qtd-1) x valorParcela + ultima.
function somaParcelas(d) {
  return centavos(d.valorParcela * (d.qtd - 1) + d.ultima)
}

test('divide exato quando o total é divisível', () => {
  const d = montarBoleto({ fornecedor: 'Café Brasil', valorTotal: 12000, parcelasQuantidade: 4 })
  assert.equal(d.valorParcela, 3000)
  assert.equal(d.ultima, 3000)
  assert.equal(somaParcelas(d), 12000)
})

test('a última parcela absorve a sobra da divisão', () => {
  const d = montarBoleto({ fornecedor: 'X', valorTotal: 100, parcelasQuantidade: 3 })
  assert.equal(d.valorParcela, 33.33)
  assert.equal(d.ultima, 33.34) // 100 - 33.33*2
  assert.equal(somaParcelas(d), 100)
})

test('a soma bate com o total em qualquer combinação', () => {
  for (let total = 1; total <= 2000; total += 7) {
    for (const qtd of [1, 2, 3, 6, 7, 11, 12, 13]) {
      const d = montarBoleto({ fornecedor: 'X', valorTotal: total / 3, parcelasQuantidade: qtd })
      if (d.erro) continue
      assert.equal(
        somaParcelas(d),
        d.valorTotal,
        `total ${d.valorTotal} em ${qtd}x somou ${somaParcelas(d)}`,
      )
    }
  }
})

test('aceita vírgula decimal e os nomes snake_case do corpo', () => {
  const d = montarBoleto({ fornecedor: 'X', valor_total: '1.234,50', parcelas_quantidade: '2' })
  assert.equal(d.valorTotal, 1234.5)
  assert.equal(d.qtd, 2)
  assert.equal(d.valorParcela, 617.25)
})

test('usa hoje quando não vem dataEntrada', () => {
  const d = montarBoleto({ fornecedor: 'X', valorTotal: 10, parcelasQuantidade: 1 })
  assert.match(d.dataEntrada, /^\d{4}-\d{2}-\d{2}$/)
})

test('recusa entradas inválidas', () => {
  const casos = [
    [{}, /obrigat|Informe/i],
    [{ fornecedor: 'X', valorTotal: 100 }, /Informe/],
    [{ fornecedor: '', valorTotal: 100, parcelasQuantidade: 2 }, /Informe/],
    [{ fornecedor: 'X', valorTotal: 0, parcelasQuantidade: 2 }, /maior que zero/],
    [{ fornecedor: 'X', valorTotal: -5, parcelasQuantidade: 2 }, /maior que zero/],
    [{ fornecedor: 'X', valorTotal: 100, parcelasQuantidade: 0 }, /maior que zero/],
    [{ fornecedor: 'X', valorTotal: 100, parcelasQuantidade: -3 }, /maior que zero/],
    [{ fornecedor: 'X', valorTotal: 100, parcelasQuantidade: MAX_PARCELAS + 1 }, /No máximo/],
    [{ fornecedor: 'X', valorTotal: 100, parcelasQuantidade: 2, dataEntrada: '10/09/2026' }, /AAAA-MM-DD/],
    // 0,01 em 3x: a última ficaria <= 0
    [{ fornecedor: 'X', valorTotal: 0.01, parcelasQuantidade: 3 }, /baixo demais/],
  ]
  for (const [corpo, esperado] of casos) {
    const d = montarBoleto(corpo)
    assert.ok(d.erro, `deveria recusar: ${JSON.stringify(corpo)}`)
    assert.match(d.erro, esperado)
  }
})

test('uma parcela só devolve o total inteiro', () => {
  const d = montarBoleto({ fornecedor: 'X', valorTotal: 999.99, parcelasQuantidade: 1 })
  assert.equal(d.valorParcela, 999.99)
  assert.equal(d.ultima, 999.99)
  assert.equal(somaParcelas(d), 999.99)
})

/* ---------- montarEdicao (PUT) ---------- */
// `atual` imita o que o Postgres devolve: numeric vira string, date vem
// normalizada por to_char.
const ATUAL = {
  id: 1,
  fornecedor: 'Café Brasil',
  data_entrada: '2026-09-10',
  valor_total: '12000.00',
  parcelas_quantidade: 4,
  valor_parcela: '3000.00',
  observacoes: null,
}

test('PUT: muda total e quantidade e refaz as parcelas', () => {
  const d = montarEdicao({ valorTotal: 15000, parcelasQuantidade: 5 }, ATUAL)
  assert.equal(d.valorTotal, 15000)
  assert.equal(d.qtd, 5)
  assert.equal(d.valorParcela, 3000)
  assert.equal(d.ultima, 3000)
  assert.equal(d.regenerar, true)
  assert.equal(d.fornecedor, 'Café Brasil') // campo ausente não muda
})

test('PUT: numeric como string não dispara regeneração à toa', () => {
  const d = montarEdicao({ valorTotal: 12000, parcelasQuantidade: 4 }, ATUAL)
  assert.equal(d.regenerar, false, "'12000.00' e 12000 são o mesmo valor")
})

test('PUT: mexer só em fornecedor/observações não refaz parcelas', () => {
  const d = montarEdicao({ fornecedor: 'Outro', observacoes: 'nota' }, ATUAL)
  assert.equal(d.regenerar, false)
  assert.equal(d.fornecedor, 'Outro')
  assert.equal(d.observacoes, 'nota')
  assert.equal(d.valorTotal, 12000)
  assert.equal(d.qtd, 4)
})

test('PUT: mudar a data de entrada refaz as parcelas (é a base dos vencimentos)', () => {
  const d = montarEdicao({ dataEntrada: '2026-10-01' }, ATUAL)
  assert.equal(d.regenerar, true)
})

test('PUT: corpo vazio é no-op válido', () => {
  const d = montarEdicao({}, ATUAL)
  assert.ok(!d.erro)
  assert.equal(d.regenerar, false)
  assert.equal(d.valorParcela, 3000)
})

test('PUT: observacoes vazio limpa o campo', () => {
  const d = montarEdicao({ observacoes: '' }, { ...ATUAL, observacoes: 'antiga' })
  assert.equal(d.observacoes, null)
})

test('PUT: recusa entradas inválidas', () => {
  const casos = [
    [{ fornecedor: '   ' }, /fornecedor/],
    [{ valorTotal: 0 }, /maior que zero/],
    [{ valorTotal: -1 }, /maior que zero/],
    [{ parcelasQuantidade: 0 }, /maior que zero/],
    [{ parcelasQuantidade: 999 }, /No máximo/],
    [{ dataEntrada: '01/10/2026' }, /AAAA-MM-DD/],
    [{ valorTotal: 0.01, parcelasQuantidade: 5 }, /baixo demais/],
  ]
  for (const [corpo, esperado] of casos) {
    const d = montarEdicao(corpo, ATUAL)
    assert.ok(d.erro, `deveria recusar: ${JSON.stringify(corpo)}`)
    assert.match(d.erro, esperado)
  }
})

/* ---------- Vencimentos informados um a um ---------- */

const BASE = { qtd: 3, dataEntrada: '2026-09-13', hoje: '2026-09-13' }

test('vencimentos: ausente mantém a regra antiga (data_entrada + N meses)', () => {
  assert.equal(montarVencimentos(undefined, BASE).vencimentos, null)
  assert.equal(montarVencimentos(null, BASE).vencimentos, null)
})

test('vencimentos: aceita uma data por parcela', () => {
  const r = montarVencimentos(['2026-10-13', '2026-11-13', '2026-12-13'], BASE)
  assert.deepEqual(r.vencimentos, ['2026-10-13', '2026-11-13', '2026-12-13'])
})

test('vencimentos: a quantidade tem de bater com a das parcelas', () => {
  assert.match(montarVencimentos(['2026-10-13'], BASE).erro, /Informe 3 vencimento/)
  assert.match(montarVencimentos('2026-10-13', BASE).erro, /lista de datas/)
})

test('vencimentos: recusa data anterior ou igual à entrada', () => {
  const r = montarVencimentos(['2026-09-13', '2026-11-13', '2026-12-13'], BASE)
  assert.match(r.erro, /parcela 1.*posterior à data de entrada/)
})

test('vencimentos: recusa formato fora de AAAA-MM-DD', () => {
  const r = montarVencimentos(['13/10/2026', '2026-11-13', '2026-12-13'], BASE)
  assert.match(r.erro, /parcela 1.*AAAA-MM-DD/)
})

test('vencimentos: data nova no passado é recusada', () => {
  const r = montarVencimentos(['2026-09-01', '2026-11-13', '2026-12-13'], {
    ...BASE,
    dataEntrada: '2026-08-01',
    atuais: ['2026-10-13', '2026-11-13', '2026-12-13'],
  })
  assert.match(r.erro, /parcela 1.*está no passado/)
})

// Esta é a que evita travar a edição de boleto antigo: as datas vencidas já
// estavam gravadas, então reenviá-las sem mexer tem de passar.
test('vencimentos: data no passado passa se já era a gravada', () => {
  const atuais = ['2026-09-01', '2026-10-01', '2026-11-01']
  const r = montarVencimentos(atuais, {
    qtd: 3,
    dataEntrada: '2026-08-01',
    hoje: '2026-09-13',
    atuais,
  })
  assert.deepEqual(r.vencimentos, atuais)
})

test('vencimentos: fora de ordem passa, mas é sinalizado', () => {
  const datas = ['2026-12-13', '2026-10-13', '2026-11-13']
  assert.deepEqual(montarVencimentos(datas, BASE).vencimentos, datas)
  assert.equal(vencimentosForaDeOrdem(datas), true)
  assert.equal(vencimentosForaDeOrdem(['2026-10-13', '2026-11-13']), false)
})

test('hojeLocal devolve a data de Londrina, não a do UTC', () => {
  // 13/09/2026 00:30 UTC = 12/09/2026 21:30 em Londrina (UTC-3).
  assert.equal(hojeLocal(new Date('2026-09-13T00:30:00Z')), '2026-09-12')
  assert.match(hojeLocal(), /^\d{4}-\d{2}-\d{2}$/)
})
