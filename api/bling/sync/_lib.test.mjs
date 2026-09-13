// Regras da sincronização que não dependem do banco nem da API do Bling.
// O parser de gramatura é o ponto frágil: se ele errar, o saldo de uma
// gramatura vai parar na outra. Rodar: node --test api/bling/sync/_lib.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gramaturaDeTexto, nomePai, ehVariacao, saldoBlingDe } from './_regras.js'

test('gramaturaDeTexto reconhece os rótulos do catálogo', () => {
  assert.equal(gramaturaDeTexto('Café Bourbon Grão: 250g'), '250g')
  assert.equal(gramaturaDeTexto('Café Bourbon Grão: 200 g'), '200g')
  assert.equal(gramaturaDeTexto('Café Bourbon Grão: 1kg'), '1kg')
  assert.equal(gramaturaDeTexto('Café Bourbon Grão: 1 Kg'), '1kg')
  assert.equal(gramaturaDeTexto('Café Bourbon Grão: 1000g'), '1kg')
  assert.equal(gramaturaDeTexto('Café Bourbon Drip'), 'Drip (10g)')
  assert.equal(gramaturaDeTexto('Café Bourbon Sachê'), 'Drip (10g)')
  assert.equal(gramaturaDeTexto('Café Bourbon Grão: 0,25kg'), '250g')
})

test('gramaturaDeTexto não confunde o "g" de "Grão" com grama', () => {
  assert.equal(gramaturaDeTexto('Café Bourbon Grão'), null)
  assert.equal(gramaturaDeTexto('Grão: Moído'), null)
})

test('gramaturaDeTexto devolve null para gramatura fora do catálogo', () => {
  // 500g existe no mundo, mas não no pa_cadastro — melhor reportar do que chutar.
  assert.equal(gramaturaDeTexto('Café Bourbon Grão: 500g'), null)
  assert.equal(gramaturaDeTexto('Café Bourbon'), null)
  assert.equal(gramaturaDeTexto(''), null)
  assert.equal(gramaturaDeTexto(null), null)
})

test('nomePai remove o sufixo de variação', () => {
  assert.equal(nomePai('Café Bourbon Amarelo Grão: 250g'), 'Café Bourbon Amarelo')
  assert.equal(nomePai('Café Bourbon Amarelo'), 'Café Bourbon Amarelo')
  assert.equal(nomePai(''), '')
})

test('ehVariacao separa pai de variação como o import já fazia', () => {
  assert.equal(ehVariacao({ nome: 'Café X Grão: 250g' }), true)
  assert.equal(ehVariacao({ nome: 'Café X' }), false)
  assert.equal(ehVariacao({}), false)
})

test('saldoBlingDe cobre os três nomes de campo que a API já usou', () => {
  assert.equal(saldoBlingDe({ estoque: { saldoVirtualTotal: 12 } }), 12)
  assert.equal(saldoBlingDe({ saldoVirtualTotal: 7 }), 7)
  assert.equal(saldoBlingDe({ saldoFisicoTotal: 3 }), 3)
  assert.equal(saldoBlingDe({}), 0)
  // saldo zero é saldo, não ausência de campo
  assert.equal(saldoBlingDe({ estoque: { saldoVirtualTotal: 0 } }), 0)
})
