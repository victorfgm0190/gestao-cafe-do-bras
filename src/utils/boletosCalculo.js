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
