// Script CLI para aplicar o schema.sql no banco Neon.
//
// Uso (local ou CI, com DATABASE_URL no ambiente):
//   node api/setup-db.js
//
// Idempotente: o schema usa CREATE ... IF NOT EXISTS, então rodar mais de uma
// vez é seguro.

import { pathToFileURL } from 'node:url'
import { sql } from './db.js'
import { aplicarSchema } from './_setup-lib.js'

async function main() {
  console.log('→ Conectando no Neon e aplicando api/schema.sql...\n')
  try {
    const { statements, tabelas, indices } = await aplicarSchema(sql)
    console.log(`✔ Schema aplicado com sucesso.`)
    console.log(`  • ${statements} statements executados`)
    console.log(`  • ${tabelas} tabelas criadas/garantidas`)
    console.log(`  • ${indices} índices criados/garantidos`)
    process.exit(0)
  } catch (erro) {
    console.error('\n✗ ERRO ao aplicar o schema:')
    console.error(`  ${erro.message}`)
    console.error('\nVerifique se DATABASE_URL aponta para o banco Neon correto.')
    process.exit(1)
  }
}

// Só executa quando chamado diretamente (node api/setup-db.js); importar o
// módulo (ex.: bundling da Vercel) NÃO dispara a migração.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
