// Regras de boleto usadas pelas telas que NÃO dependem de rede nem de
// localStorage. Separado de boletos.js (que importa ./api) para poder ser
// testado direto no node — mesmo motivo do api/boletos/_lib.js no backend.
// Fonte da verdade continua sendo o backend: aqui só há prévia e formatação.

// Mesmo teto do backend (api/boletos/_lib.js).
export const MAX_PARCELAS = 120

// O Postgres devolve DATE ora como 'AAAA-MM-DD', ora como Date (que vira
// '...T00:00:00.000Z' no JSON). GET /api/boletos/:id já normaliza com to_char,
// mas a listagem devolve b.* cru — daí este normalizador.
export function dataISO(valor) {
  if (!valor) return ''
  const texto = valor instanceof Date ? valor.toISOString() : String(valor)
  return /^\d{4}-\d{2}-\d{2}/.test(texto) ? texto.slice(0, 10) : texto
}

// Aceita '1234.56', '1234,56' e '1.234,56' — mesma regra do api/boletos/_lib.js.
// Havendo vírgula, ela é o decimal e os pontos são de milhar.
export function num(v) {
  const t = String(v ?? '').trim()
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
}

// Soma meses como o Postgres soma `interval 'n month'`: o dia é preso ao
// último dia do mês de destino (31/01 + 1 mês = 28/02, ou 29/02 em bissexto).
// new Date().setMonth() faria 31/01 + 1 mês = 03/03 e a tela mostraria uma data
// diferente da que o backend geraria.
export function somarMeses(dataISO, meses) {
  const [ano, mes, dia] = String(dataISO).split('-').map(Number)
  const alvo = mes - 1 + meses
  const anoFinal = ano + Math.floor(alvo / 12)
  const mesFinal = ((alvo % 12) + 12) % 12
  const ultimoDia = new Date(Date.UTC(anoFinal, mesFinal + 1, 0)).getUTCDate()
  const p = (n) => String(n).padStart(2, '0')
  return `${anoFinal}-${p(mesFinal + 1)}-${p(Math.min(dia, ultimoDia))}`
}

// Vencimentos sugeridos: uma parcela por mês a partir da data de entrada. É o
// ponto de partida do formulário — o usuário ajusta cada data na mão.
export function vencimentosPadrao(dataEntrada, qtd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dataEntrada)) || !(qtd > 0)) return []
  return Array.from({ length: qtd }, (_, i) => somarMeses(dataEntrada, i + 1))
}

const centavos = (v) => Math.round(v * 100) / 100

// Prévia da divisão em centavos exibida no formulário. Espelha
// dividirParcelas() do api/boletos/_lib.js — boletos.test.mjs compara as duas.
export function previaParcelas(valorTotal, qtd) {
  if (!(valorTotal > 0) || !(qtd > 0)) return null
  const valorParcela = centavos(valorTotal / qtd)
  const ultima = centavos(valorTotal - valorParcela * (qtd - 1))
  if (valorParcela <= 0 || ultima <= 0) return null
  return { valorParcela, ultima, iguais: valorParcela === ultima }
}
