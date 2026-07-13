// Lógica compartilhada de aplicação do schema no PostgreSQL (Neon).
// Arquivos/pastas começando com "_" NÃO viram rotas na Vercel — módulo utilitário
// reutilizado pelo script CLI (setup-db.js) e pelo endpoint (setup.js).

import { readFileSync } from 'node:fs'

// Lê o schema.sql que fica ao lado deste módulo (api/schema.sql).
export function lerSchema() {
  const url = new URL('./schema.sql', import.meta.url)
  return readFileSync(url, 'utf8')
}

// O driver HTTP do Neon executa UMA statement por chamada. Quebramos o schema
// em statements individuais: removemos comentários de linha (-- ...) e cortamos
// no ';'. O schema não tem ';' dentro de strings nem blocos $$...$$, então o
// split é seguro. A ordem do arquivo respeita as dependências de FK.
export function extrairStatements(sql) {
  const semComentarios = sql
    .split('\n')
    .map((linha) => {
      const i = linha.indexOf('--')
      return i >= 0 ? linha.slice(0, i) : linha
    })
    .join('\n')

  return semComentarios
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

// Executa o schema completo, statement por statement, em ordem.
// `sql` é a função tagged-template do Neon (usamos sql.query para SQL cru).
// Retorna um resumo: { statements, tabelas, indices }.
export async function aplicarSchema(sql) {
  const statements = extrairStatements(lerSchema())

  let tabelas = 0
  let indices = 0

  for (const stmt of statements) {
    try {
      await sql.query(stmt)
    } catch (erro) {
      // Enriquecemos o erro com o trecho que falhou, para diagnóstico claro.
      const trecho = stmt.replace(/\s+/g, ' ').slice(0, 80)
      throw new Error(`Falha ao executar statement [${trecho}...]: ${erro.message}`)
    }
    if (/^CREATE\s+TABLE/i.test(stmt)) tabelas += 1
    else if (/^CREATE\s+INDEX/i.test(stmt)) indices += 1
  }

  return { statements: statements.length, tabelas, indices }
}
