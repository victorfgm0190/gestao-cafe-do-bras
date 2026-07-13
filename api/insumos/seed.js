// POST /api/insumos/seed  (header x-setup-key: cafe-do-bras-2026)
// Semeia os 6 insumos iniciais. Idempotente: só insere o que ainda não existe
// (checagem por nome, já que a tabela não tem UNIQUE em nome).

import { sql } from '../db.js'
import { aplicarCors, enviarJson, enviarErro } from '../_http.js'

const CHAVE_SETUP = 'cafe-do-bras-2026'

const CADASTRO_INICIAL = [
  { nome: 'Embalagem 250g', unidade: 'un', estoqueMinimo: 100, descricao: 'Embalagem stand-up pouch de 250g.' },
  { nome: 'Embalagem 1kg', unidade: 'un', estoqueMinimo: 50, descricao: 'Embalagem stand-up pouch de 1kg.' },
  { nome: 'Válvula unidirecional', unidade: 'un', estoqueMinimo: 200, descricao: 'Válvula desgaseificadora.' },
  { nome: 'Etiqueta', unidade: 'un', estoqueMinimo: 300, descricao: 'Etiqueta adesiva de identificação.' },
  { nome: 'Caixa de transporte', unidade: 'cx', estoqueMinimo: 20, descricao: 'Caixa de papelão para envio.' },
  { nome: 'Drip filter', unidade: 'un', estoqueMinimo: 100, descricao: 'Sachê drip coffee individual.' },
]

export default async function handler(req, res) {
  if (aplicarCors(req, res)) return
  if (req.headers['x-setup-key'] !== CHAVE_SETUP) {
    return enviarErro(res, 401, 'Não autorizado. Header x-setup-key ausente ou inválido.')
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST')
    return enviarErro(res, 405, `Método ${req.method} não permitido.`)
  }

  try {
    let criados = 0
    for (const i of CADASTRO_INICIAL) {
      const linhas = await sql`
        INSERT INTO insumos_cadastro (nome, unidade, estoque_minimo, descricao)
        SELECT ${i.nome}, ${i.unidade}, ${i.estoqueMinimo}, ${i.descricao}
        WHERE NOT EXISTS (SELECT 1 FROM insumos_cadastro WHERE nome = ${i.nome})
        RETURNING id
      `
      if (linhas.length) criados += 1
    }
    return enviarJson(res, 200, {
      success: true,
      message: `${criados} insumo(s) criado(s); ${CADASTRO_INICIAL.length - criados} já existia(m).`,
      criados,
    })
  } catch (erro) {
    return enviarErro(res, 500, `Falha ao semear insumos: ${erro?.message || erro}`)
  }
}
