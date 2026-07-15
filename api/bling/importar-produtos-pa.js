// GET /api/bling/importar-produtos-pa
// Importa os produtos PAI do Bling (sem variação — nome não contém "Grão:")
// para a tabela pa_cadastro, fazendo UPSERT pela chave bling_id.
//
// Cada produto importado recebe os padrões do catálogo de PA:
//   gramaturas = [250, 1000], embalagem_250_id = 1, embalagem_1000_id = 2,
//   perda_torra_padrao = 10, ativo = true
//
// Os produtos de teste existentes (bling_id NULL) NÃO são apagados aqui.

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro, garantirMetodo } from '../_http.js'
import { blingFetch } from './auth.js'

// Busca todas as páginas de produtos do Bling (100 por página).
async function buscarTodosProdutos() {
  const todos = []
  for (let pagina = 1; pagina <= 50; pagina++) {
    const params = new URLSearchParams({ pagina: String(pagina), limite: '100' })
    const json = await blingFetch(`/produtos?${params.toString()}`)
    const lista = Array.isArray(json.data) ? json.data : []
    todos.push(...lista)
    if (lista.length < 100) break // última página
  }
  return todos
}

// Nome do produto pai já vem limpo; por segurança removemos o sufixo de variação.
function nomeLimpo(nome) {
  return String(nome || '').split('Grão:')[0].trim()
}

const GRAMATURAS_PADRAO = [250, 1000]

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (!garantirMetodo(req, res, 'GET')) return

  try {
    // Garante a coluna bling_id (migração idempotente).
    await sql`ALTER TABLE pa_cadastro ADD COLUMN IF NOT EXISTS bling_id integer`

    const produtos = await buscarTodosProdutos()
    // Só os produtos PAI (sem variação): nome não contém "Grão:".
    const pais = produtos.filter((p) => !String(p.nome || '').includes('Grão:'))

    let inseridos = 0
    let atualizados = 0
    for (const p of pais) {
      const blingId = Number(p.id) || null
      const nome = nomeLimpo(p.nome)
      if (!nome || !blingId) continue

      const existentes = await sql`SELECT id FROM pa_cadastro WHERE bling_id = ${blingId} LIMIT 1`
      if (existentes.length > 0) {
        await sql`
          UPDATE pa_cadastro
             SET nome = ${nome},
                 gramaturas = ${JSON.stringify(GRAMATURAS_PADRAO)}::jsonb,
                 embalagem_250_id = 1,
                 embalagem_1000_id = 2,
                 perda_torra_padrao = 10,
                 ativo = true
           WHERE bling_id = ${blingId}
        `
        atualizados++
      } else {
        await sql`
          INSERT INTO pa_cadastro
            (nome, bling_id, gramaturas, embalagem_250_id, embalagem_1000_id, perda_torra_padrao, ativo)
          VALUES (${nome}, ${blingId}, ${JSON.stringify(GRAMATURAS_PADRAO)}::jsonb, 1, 2, 10, true)
        `
        inseridos++
      }
    }

    return enviarJson(res, 200, {
      sucesso: true,
      inseridos,
      atualizados,
      total: inseridos + atualizados,
    })
  } catch (erro) {
    const status = erro?.status === 401 ? 401 : 500
    return enviarErro(res, status, `Falha ao importar produtos do Bling: ${erro?.message || erro}`)
  }
}
