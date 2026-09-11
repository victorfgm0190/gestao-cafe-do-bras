// Testes das regras de boleto que não dependem do banco.
// Rodar: node api/boletos/_lib.test.mjs
// Usa node:test (embutido no Node) — o projeto não tem jest nem supertest.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarBoleto, centavos, MAX_PARCELAS } from './_lib.js'

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
