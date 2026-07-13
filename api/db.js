// Conexão com o PostgreSQL (Neon) via driver serverless.
//
// A connection string vem da variável de ambiente DATABASE_URL, configurada no
// painel da Vercel (e em .env para desenvolvimento local). NUNCA comite o valor.
//
// Uso (tagged template — os parâmetros são sempre escapados, sem risco de SQL injection):
//   import { sql } from '../db.js'
//   const linhas = await sql`SELECT * FROM usuarios WHERE username = ${nome}`
//
// Para múltiplas queries numa transação, use `transacao`:
//   await transacao([
//     sql`INSERT INTO ...`,
//     sql`UPDATE ...`,
//   ])

import { neon } from '@neondatabase/serverless'

const { DATABASE_URL } = process.env

if (!DATABASE_URL) {
  // Falha cedo e com mensagem clara — sem a env não há como operar.
  throw new Error(
    'DATABASE_URL não configurada. Defina a connection string do Neon no painel da Vercel (e em .env local).',
  )
}

// `sql` é uma tagged template function. Use-a para todas as queries.
export const sql = neon(DATABASE_URL)

// Executa uma lista de queries do `sql` como uma única transação atômica.
// Ex.: await transacao([ sql`INSERT ...`, sql`UPDATE ...` ])
export function transacao(queries) {
  return sql.transaction(queries)
}
