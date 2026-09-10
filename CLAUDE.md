# Gestão Café do Brás

Sistema de gestão para microtorrefação de café especial, desenvolvido em React + Vite, hospedado na Vercel.

## Sobre o projeto
- **Empresa:** Café do Brás — microtorrefação em Londrina/PR
- **Repositório:** github.com/victorfgm0190/gestao-cafe-do-bras
- **Deploy:** gestao-cafe-do-bras.vercel.app
- **Stack:** React + Vite, PostgreSQL (Neon), Vercel Serverless Functions, Upstash Redis
- **Cores:** Verde escuro #2C3B1F, Dourado #C9A84C, Creme #F0EAD6, Off-white #FAF7F0

## Módulos concluídos
- Autenticação com perfis de permissão (Master, Financeiro, Estoque, Mestre de Torra, Vendas, Consulta)
- Sessão por JWT (`api/_auth.js`) — todas as rotas da API exigem `Authorization: Bearer` e checam permissão por módulo direto no banco
- Gerenciamento de Usuários (Master) — CRUD no banco em `/usuarios`, matriz de permissões por módulo, redefinição de senha com opção de forçar a troca no próximo login
- Dashboard com alertas de estoque mínimo
- Café Cru (MP) — entrada, kardex, saldo, recálculo em cascata
- Insumos — CRUD e kardex de materiais de embalagem
- Café Torrado (PP) — gerado exclusivamente por ordens de produção
- Produtos Acabados (PA) — fluxo completo de ordem de produção com perda de torra
- Inventário Inteligente — contagens diária, semanal, mensal
- Contas a Pagar — 18 categorias de despesa
- Integração Bling ERP OAuth2 — conectado, tokens no Upstash Redis

## Regras de negócio críticas
- Custo médio isolado por fazenda + variedade (NUNCA misturar grupos diferentes)
- Sobra de café torrado entra no estoque a custo ZERO
- Perda de torra é informativa; todo custo vai para as unidades embaladas
- Ordem de Produção é o fluxo diário mais importante

## Integrações
- **Bling API v3 OAuth2:** tokens persistidos no Upstash Redis (cafe-bras-tokens)
- **Neon PostgreSQL:** banco principal (migrado do localStorage)
- **Vercel:** hospedagem + variáveis de ambiente

## Próximos módulos
- Sincronização de produtos com Bling
- Módulo de Vendas (integrado ao Bling)
- Relatórios

## Fase 1 (V2) — Banco de dados

O schema vive em `api/schema.sql` e é aplicado por `POST /api/setup`
(header `x-setup-key`) ou `node api/setup-db.js`. Tudo é idempotente
(`CREATE ... IF NOT EXISTS`), então reaplicar é seguro. **Não usamos Prisma** —
as queries são `sql` tagged template do `@neondatabase/serverless` (`api/db.js`).

### Tabelas criadas
| Tabela | Papel |
|--------|-------|
| `boletos` | Boleto/NF do fornecedor, com total e nº de parcelas |
| `boleto_parcelas` | Uma linha por parcela; UNIQUE (boleto_id, numero_parcela) |
| `vinculos` | Liga boleto → lote de café cru (e opcionalmente insumo); é o que vira custo de estoque |
| `vinculo_impacto` | Append-only: valor antes/depois de cada registro tocado pelo recálculo em cascata |
| `bling_sync_status` | Status por SKU — UNIQUE (produto_id, gramatura), porque no Bling cada gramatura é uma variação |
| `bling_sync_log` | Append-only: histórico de push/pull de saldo + resposta crua do Bling |

### View criada
- `pa_estoque_com_sync` — soma `pa_estoque.quantidade` por (pa_id, gramatura) e compara com o saldo do Bling.

### O que NÃO foi feito, e por quê
- **`torradas` / `torradas_detalhes` / `torradas_sobra`**: `ordens_producao` já guarda data, pa_id, `lotes` (JSONB com kg e custo por lote), `itens` (JSONB por gramatura), sobra, perda e custos; `torras_historico` já guarda peso cru, peso torrado, perda e rendimento. Criar as três daria duas fontes de verdade para a ordem de produção.
- **Colunas `saldo_real` / `saldo_projetado` / `saldo_total` em `pa_estoque`**: `pa_estoque` é razão (uma linha por movimento), não tabela de saldo — não existe coluna `saldo` para migrar. Os três números já são calculados em `resumoProjecaoPA()` (`api/pa/_lib.js`), servidos por `GET /api/pa/projecao`.

### Convenções seguidas
`criado_em` / `atualizado_em` / `excluido_em` (não `created_at`), `DECIMAL(14,3)` para kg e quantidades, `DECIMAL(14,2)` para dinheiro, `DECIMAL(14,4)` para custo unitário. FKs para `usuarios` são `ON DELETE SET NULL`, para não travar a exclusão de usuário nem perder histórico.

### Próxima fase: APIs
`POST /api/torradas` (sobre `ordens_producao`), `POST /api/boletos`, `POST /api/vinculos` (com cascata), `GET /api/bling/sync-status`.

## Registro de sessões
| Data | Início | Fim | O que foi feito |
|------|--------|-----|-----------------|
| 2026-07-14 | 21:34 | 23:12 | Conexão OAuth2 Bling concluída; sincronização de 93 produtos do Bling; importação de 23 produtos pai do Bling para pa_cadastro; adição das gramaturas 200g e Drip (10g) em todos os PAs; migração de gramatura de INTEGER para TEXT no banco; criação do CLAUDE.md com contexto do projeto |
| 2026-09-10 | 16:45 | 17:15 | Autenticação JWT ponta a ponta: criado `api/_auth.js` (token, guardas `exigirAutenticacao`/`exigirPermissao`/`exigirMaster`, auditoria no `audit_log`); 46 rotas da API protegidas com permissão por módulo; login passa a emitir token e change-password passa a alterar só o dono do token; front envia `Authorization: Bearer` em toda chamada e derruba a sessão em 401; `Authorization` liberado no CORS; novas envs `JWT_SECRET` e `JWT_EXPIRY` |
| 2026-09-10 | 17:20 | 18:05 | Gerenciamento de usuários no banco: APIs `api/usuarios/{listar,criar,editar,trocar-senha,excluir}` restritas ao Master (corrigido `if (!exigirMaster(...))` sem `await`, que nunca bloqueava por ser Promise); perfis validados contra `PERFIS` reais e `permissoes` gravadas no INSERT; `Usuarios.jsx`/`NovoUsuario.jsx` migradas de localStorage para as APIs, com campo de login, senha inicial e redefinição de senha com checkbox "forçar troca no próximo login"; usuário novo passa a nascer com `primeiro_acesso = false`; dica de login removida da tela inicial |
| 2026-09-10 | 18:10 | 18:55 | Fase 1 V2 (banco): 6 tabelas novas em `api/schema.sql` — `boletos`, `boleto_parcelas`, `vinculos`, `vinculo_impacto`, `bling_sync_status`, `bling_sync_log` — mais a view `pa_estoque_com_sync`. Spec original vinha em Prisma (projeto não usa) e não executava: FK para `cadastro_insumos` (nome real `insumos_cadastro`), `UPDATE pa_estoque SET saldo_real = COALESCE(saldo,0)` numa tabela sem coluna `saldo`, e CHECK de gramatura sem `200g`/`Drip (10g)`. `torradas`/`detalhes`/`sobra` e as colunas de saldo em `pa_estoque` foram descartadas por duplicarem `ordens_producao` e `resumoProjecaoPA()` |
