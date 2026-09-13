// A prévia de parcelas mostrada no formulário precisa bater EXATAMENTE com a
// divisão que o backend grava — senão o usuário confere um valor na tela e o
// banco guarda outro. Este teste compara as duas implementações.
import test from 'node:test'
import assert from 'node:assert/strict'

import { dataISO, num, previaParcelas } from './boletosCalculo.js'
import { dividirParcelas, num as numServidor } from '../../api/boletos/_lib.js'

test('previaParcelas concorda com dividirParcelas do backend', () => {
  const valores = [0.03, 1, 9.99, 100, 1234.56, 12000, 87654.32]
  const quantidades = [1, 2, 3, 7, 12, 24, 120]

  for (const valor of valores) {
    for (const qtd of quantidades) {
      const front = previaParcelas(valor, qtd)
      const back = dividirParcelas(valor, qtd)

      if (back.erro) {
        assert.equal(front, null, `${valor} em ${qtd}x: backend recusa, front deveria recusar`)
        continue
      }
      assert.equal(front.valorParcela, back.valorParcela, `${valor} em ${qtd}x: valor da parcela`)
      assert.equal(front.ultima, back.ultima, `${valor} em ${qtd}x: última parcela`)
    }
  }
})

test('a prévia soma exatamente o valor total', () => {
  for (let centavos = 1; centavos <= 2000; centavos += 7) {
    const valor = centavos / 100
    for (const qtd of [1, 3, 5, 12]) {
      const p = previaParcelas(valor, qtd)
      if (!p) continue
      const soma = Math.round((p.valorParcela * (qtd - 1) + p.ultima) * 100) / 100
      assert.equal(soma, valor, `${valor} em ${qtd}x`)
    }
  }
})

test('previaParcelas recusa entradas sem sentido', () => {
  assert.equal(previaParcelas(0, 3), null)
  assert.equal(previaParcelas(-10, 3), null)
  assert.equal(previaParcelas(100, 0), null)
  assert.equal(previaParcelas(0.01, 5), null) // daria parcelas de R$ 0,00
})

test('num interpreta vírgula e ponto como o backend', () => {
  for (const entrada of ['1234.56', '1234,56', '1.234,56', '12000', ' 99,9 ']) {
    assert.equal(num(entrada), numServidor(entrada), entrada)
  }
})

test('dataISO normaliza as duas formas que o Postgres devolve', () => {
  assert.equal(dataISO('2026-09-13'), '2026-09-13')
  assert.equal(dataISO('2026-09-13T00:00:00.000Z'), '2026-09-13')
  assert.equal(dataISO(new Date('2026-09-13T00:00:00.000Z')), '2026-09-13')
  assert.equal(dataISO(null), '')
  assert.equal(dataISO(undefined), '')
})
