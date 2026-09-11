// Smoke test ponta a ponta dos boletos contra um deploy de verdade.
// Arquivos começando com "_" NÃO viram rotas na Vercel, e o nome não termina
// em .test.mjs de propósito: `npm test` não deve chamar a rede nem exigir token.
//
//   npm run test:e2e -- <token-jwt>
//   API_BASE=https://<preview>.vercel.app/api npm run test:e2e -- <token>
//
// Pegue o token no navegador, logado:  localStorage.getItem('cafe_do_bras_token')
//
// Cria um boleto, edita, cancela e confere cada passo. O boleto fica CANCELADO
// no fim (exclusão lógica): some das listagens, mas a linha permanece no banco,
// porque não existe exclusão física por API. ESCREVE NO BANCO APONTADO PELO
// DEPLOY — em produção, isso é a base real.

const TOKEN = process.argv[2]
if (!TOKEN) {
  console.error('Falta o token. Uso: npm run test:e2e -- <token-jwt>')
  process.exit(1)
}

const BASE = process.env.API_BASE || 'https://gestao-cafe-do-bras.vercel.app/api'
console.log(`alvo: ${BASE}`)
let falhas = 0

function ok(cond, descricao, detalhe = '') {
  console.log(`${cond ? '  OK  ' : ' FALHA'} ${descricao}${detalhe ? ` :: ${detalhe}` : ''}`)
  if (!cond) falhas++
}

async function api(caminho, metodo = 'GET', corpo) {
  const r = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const dados = await r.json().catch(() => ({}))
  return { status: r.status, dados }
}

async function main() {
  const n = (v) => Number(v)

  // ---------- 1. POST ----------
  console.log('\n1. POST /api/boletos — Café Brasil / R$ 12.000 / 4x')
  const criado = await api('/boletos', 'POST', {
    fornecedor: 'Café Brasil',
    valorTotal: 12000,
    parcelasQuantidade: 4,
    dataEntrada: '2026-09-10',
    observacoes: 'Teste ponta a ponta — pode cancelar',
  })
  ok(criado.status === 201, 'status 201', `recebido ${criado.status} ${criado.dados.error || ''}`)
  const b = criado.dados.boleto
  if (!b) {
    console.error('\nSem boleto na resposta, abortando.', criado.dados)
    return 1
  }
  const ID = b.id
  console.log(`   id = ${ID}`)
  ok(n(b.valor_parcela) === 3000, 'valor_parcela = 3000', b.valor_parcela)
  ok(b.status === 'SEM_VINCULO', 'status SEM_VINCULO', b.status)
  ok(b.parcelas?.length === 4, '4 parcelas geradas', `${b.parcelas?.length}`)
  const vencs = b.parcelas.map((p) => p.data_vencimento)
  ok(
    JSON.stringify(vencs) === JSON.stringify(['2026-10-10', '2026-11-10', '2026-12-10', '2027-01-10']),
    'vencimentos mensais a partir da data de entrada',
    vencs.join(' '),
  )
  ok(
    b.parcelas.reduce((s, p) => s + n(p.valor), 0) === 12000,
    'soma das parcelas = 12000',
    String(b.parcelas.reduce((s, p) => s + n(p.valor), 0)),
  )

  // ---------- 2. GET lista ----------
  console.log('\n2. GET /api/boletos')
  const lista = await api('/boletos?limite=5')
  ok(lista.status === 200, 'status 200', String(lista.status))
  ok(Array.isArray(lista.dados.boletos), 'devolve boletos[]')
  ok(lista.dados.paginacao?.total >= 1, 'paginacao.total >= 1', String(lista.dados.paginacao?.total))
  const naLista = lista.dados.boletos?.find((x) => x.id === ID)
  ok(Boolean(naLista), 'o boleto criado aparece na lista')
  ok(n(naLista?.parcelas_total) === 4, 'parcelas_total = 4', String(naLista?.parcelas_total))
  ok(n(naLista?.parcelas_pagas) === 0, 'parcelas_pagas = 0', String(naLista?.parcelas_pagas))

  const semVinculo = await api('/boletos/sem-vinculo')
  ok(semVinculo.status === 200, 'GET /boletos/sem-vinculo → 200', String(semVinculo.status))
  ok(
    semVinculo.dados.boletos?.some((x) => x.id === ID),
    'aparece em sem-vinculo',
  )

  // ---------- 3. PUT ----------
  console.log('\n3. PUT /api/boletos/:id — R$ 15.000 / 5x')
  const editado = await api(`/boletos/${ID}`, 'PUT', { valorTotal: 15000, parcelasQuantidade: 5 })
  ok(editado.status === 200, 'status 200', `${editado.status} ${editado.dados.error || ''}`)
  ok(editado.dados.parcelasRefeitas === true, 'parcelasRefeitas = true')
  const e = editado.dados.boleto
  ok(n(e?.valor_total) === 15000, 'valor_total = 15000', e?.valor_total)
  ok(n(e?.valor_parcela) === 3000, 'valor_parcela recalculado = 3000', e?.valor_parcela)
  ok(e?.parcelas?.length === 5, 'agora são 5 parcelas', String(e?.parcelas?.length))
  ok(
    e?.parcelas?.every((p, i) => p.numero_parcela === i + 1),
    'parcelas renumeradas de 1 a 5 (sem colisão de UNIQUE)',
  )
  ok(
    e?.parcelas?.reduce((s, p) => s + n(p.valor), 0) === 15000,
    'soma das novas parcelas = 15000',
  )
  ok(e?.fornecedor === 'Café Brasil', 'fornecedor preservado (campo não enviado)', e?.fornecedor)

  // ---------- 4. GET confirma ----------
  console.log('\n4. GET /api/boletos/:id — confirma a edição')
  const conferido = await api(`/boletos/${ID}`)
  ok(conferido.status === 200, 'status 200', String(conferido.status))
  ok(n(conferido.dados.boleto?.valor_total) === 15000, 'persistiu 15000')
  ok(conferido.dados.boleto?.parcelas?.length === 5, 'persistiu 5 parcelas')

  // ---------- 5. DELETE ----------
  console.log('\n5. DELETE /api/boletos/:id')
  const cancelado = await api(`/boletos/${ID}`, 'DELETE')
  ok(cancelado.status === 200, 'status 200', `${cancelado.status} ${cancelado.dados.error || ''}`)
  ok(cancelado.dados.boleto?.status === 'CANCELADO', 'boleto CANCELADO', cancelado.dados.boleto?.status)
  ok(Boolean(cancelado.dados.boleto?.excluido_em), 'excluido_em preenchido')
  ok(
    cancelado.dados.boleto?.parcelas?.every((p) => p.status === 'CANCELADO'),
    'todas as parcelas CANCELADO',
  )

  // ---------- 6. GET confirma sumiço ----------
  console.log('\n6. GET — confirma que sumiu das listagens')
  const depois = await api('/boletos?limite=100')
  ok(!depois.dados.boletos?.some((x) => x.id === ID), 'não aparece mais em GET /boletos')
  const semVinculoDepois = await api('/boletos/sem-vinculo')
  ok(
    !semVinculoDepois.dados.boletos?.some((x) => x.id === ID),
    'não aparece mais em sem-vinculo',
  )
  const repetido = await api(`/boletos/${ID}`, 'DELETE')
  ok(repetido.status === 200, 'DELETE repetido é idempotente (200)', String(repetido.status))
  const editarCancelado = await api(`/boletos/${ID}`, 'PUT', { valorTotal: 1 })
  ok(editarCancelado.status === 409, 'PUT em cancelado → 409', String(editarCancelado.status))

  console.log(
    falhas === 0
      ? `\nTUDO PASSOU. Boleto #${ID} ficou cancelado no banco.`
      : `\n${falhas} VERIFICAÇÕES FALHARAM.`,
  )
  return falhas === 0 ? 0 : 1
}

process.exitCode = await main()
