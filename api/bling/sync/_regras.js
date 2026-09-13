// Regras de sincronização que NÃO tocam banco nem rede — separadas para poder
// rodar no node (api/db.js lança na importação quando falta DATABASE_URL).
// Reexportadas por _lib.js: as rotas importam de um lugar só.

// Rótulos que o sistema usa na coluna `gramatura` (TEXT).
function rotuloDeGramas(gramas) {
  if (gramas === 10) return 'Drip (10g)'
  if (gramas === 1000) return '1kg'
  if (gramas === 200 || gramas === 250) return `${gramas}g`
  return null // gramatura que o catálogo não usa
}

// Extrai a gramatura do nome (ou do código) da variação no Bling.
// Ex.: "Café Bourbon Grão: 250g" → "250g"; "... 1 kg" → "1kg"; "... Drip" →
// "Drip (10g)". Devolve null quando não reconhece — o chamador reporta como
// não mapeada em vez de chutar.
export function gramaturaDeTexto(texto) {
  const s = String(texto || '').toLowerCase()
  if (s.includes('drip') || s.includes('sache') || s.includes('sachê')) return 'Drip (10g)'

  const kg = s.match(/(\d+(?:[.,]\d+)?)\s*kg/)
  if (kg) return rotuloDeGramas(Math.round(parseFloat(kg[1].replace(',', '.')) * 1000))

  // (?![a-z]) evita casar o "g" de "grão"; \d{2,4} evita casar número solto.
  const g = s.match(/(\d{2,4})\s*g(?![a-z])/)
  if (g) return rotuloDeGramas(Number(g[1]))

  return null
}

// Nome do produto pai a partir do nome da variação ("X Grão: 250g" → "X").
export function nomePai(nome) {
  return String(nome || '').split('Grão:')[0].trim()
}

// É uma variação? (o catálogo do Bling marca a variação no nome)
export function ehVariacao(produto) {
  return String(produto?.nome || '').includes('Grão:')
}

// Saldo do Bling num produto/variação. O nome do campo mudou entre versões da
// API, então tentamos os três que já apareceram.
export function saldoBlingDe(produto) {
  return Number(
    produto?.estoque?.saldoVirtualTotal ?? produto?.saldoVirtualTotal ?? produto?.saldoFisicoTotal ?? 0,
  )
}

// Data de hoje/ontem em AAAA-MM-DD no fuso de Londrina (o runtime é UTC).
export function dataLocal(diasAtras = 0) {
  const agora = new Date()
  agora.setUTCDate(agora.getUTCDate() - diasAtras)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora)
}
