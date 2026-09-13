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

## Fase 2 (V2) — APIs de Boletos

Serverless da Vercel, um arquivo por rota (sem Express). Permissão: módulo
**Contas a Pagar** via `exigirPermissao`.

| Rota | O que faz |
|------|-----------|
| `GET /api/boletos` | Lista com filtros `?status=&fornecedor=&pagina=&limite=`; devolve `{ boletos, paginacao }` com `parcelas_total`, `parcelas_pagas` e `valor_pago` por boleto |
| `POST /api/boletos` | Cria o boleto e gera as parcelas. Corpo: `{ fornecedor, valorTotal, parcelasQuantidade, dataEntrada?, observacoes? }` |
| `GET /api/boletos/sem-vinculo` | Só `status = SEM_VINCULO` e não excluídos — alimenta o seletor da tela de vínculo |
| `GET /api/boletos/:id` | O boleto com as parcelas |
| `PUT /api/boletos/:id` | Edita; só os campos enviados mudam. Se total, quantidade ou data de entrada mudarem, as parcelas são refeitas (`parcelasRefeitas: true` na resposta) |
| `DELETE /api/boletos/:id` | Exclusão lógica: `excluido_em = NOW()`, boleto e parcelas → `CANCELADO`. Idempotente |

### Decisões
- **Criação em uma statement só, com CTEs.** O driver HTTP do Neon não abre transação interativa (`BEGIN`/`COMMIT`), então o INSERT do boleto e o das parcelas vão numa única query com `WITH ... RETURNING`, que já é atômica: não existe boleto sem parcela.
- **Vencimentos via `+ interval 'n month'`** sobre `data_entrada` (não sobre "hoje"), o que também resolve fim de mês: 31/01 + 1 mês = 28/02.
- **Divisão em centavos**: as primeiras parcelas levam `round(total/qtd, 2)` e a última absorve a diferença, para a soma bater exatamente com o total.
- **Filtros como parâmetros anuláveis** (`$1::text IS NULL OR col = $1`) em vez de SQL montado em string.
- **No PUT as parcelas são refeitas via `transacao()`, não CTE.** Sub-statements de um `WITH` compartilham o snapshot e não veem o efeito um do outro: o `INSERT` das novas parcelas bateria no `UNIQUE (boleto_id, numero_parcela)` das antigas, que o `DELETE` ainda não teria tornado invisíveis. Numa transação eles são sequenciais. (No POST o CTE funciona porque as parcelas são todas novas.)
- **Parcela paga trava a regeneração.** Refazer parcelas apaga as antigas; se alguma estiver `PAGO`, o PUT devolve 409 em vez de apagar o pagamento. O DELETE também recusa boleto com parcela paga.
- **Datas por `to_char(...,'YYYY-MM-DD')`** e valores `numeric` lidos com `Number()`: o Postgres devolve `numeric` como string, e `DATE` pode vir como string ou `Date` conforme o driver.

### Testes
`npm test` → `node --test` (embutido no Node; o projeto não tem jest/supertest). Só regra pura, sem rede nem banco.

`npm run test:e2e -- <token>` roda `api/boletos/_e2e.mjs` contra um deploy de verdade: cria, lista, edita, cancela e confere cada passo (27 verificações). **Escreve no banco do deploy apontado** — em produção é a base real; o boleto criado termina CANCELADO. Aponte para um preview com `API_BASE=https://<preview>.vercel.app/api`. Não entra no `npm test` porque o nome não termina em `.test.mjs`.
`api/boletos/_lib.test.mjs` cobre a divisão em centavos — incluindo a propriedade "soma das parcelas = total" em ~2.300 combinações — e a mesclagem do PUT, com `atual` no formato que o Postgres devolve (`numeric` como string), para garantir que `'12000.00'` vs `12000` não dispare regeneração à toa.

### Concluído depois: PUT/DELETE de boletos e `POST /api/vinculos` (com cascata)

## Fase 5 (V2) — Frontend de boletos e vínculos

O app já tinha frontend para quase tudo (dashboard, café cru, torrado, PA,
insumos, inventário, usuários, auditoria, Bling). O que faltava tela eram
justamente as APIs das fases 2 e 3. **Não** foram adicionadas dependências: nada
de Tailwind, React Query, axios ou Zustand — as telas seguem o padrão do
projeto (React + `fetch` via `src/utils/api.js` + CSS com as variáveis da
paleta, reaproveitando as classes `kx-*`/`cc-*` de `CafeCru.css`).

| Arquivo | Papel |
|---------|-------|
| `src/pages/financeiro/Boletos.jsx` | Lista com filtros, paginação, linha expansível com as parcelas, criar/editar/cancelar e o botão de vincular |
| `src/pages/financeiro/ModalBoleto.jsx` | Formulário de criação e edição, com prévia da divisão em parcelas |
| `src/pages/financeiro/ModalVinculo.jsx` | Escolhe o lote, mostra o custo/kg antes e depois e exibe o impacto devolvido pelo POST |
| `src/pages/financeiro/Vinculos.jsx` | Cards dos vínculos, modal com linha do tempo, tabela de impacto (antes/depois) e o desfazer |
| `src/pages/financeiro/AbasFinanceiro.jsx` | Abas Contas a pagar · Boletos · Vínculos |
| `src/utils/boletos.js` / `src/utils/vinculos.js` | Camada de dados (as telas não montam URL nem header na mão) |
| `src/utils/boletosCalculo.js` | Regras puras (prévia de parcelas, normalização de data/número), sem rede — para poder testar no node |

Rotas novas em `App.jsx`: `/financeiro/boletos` e `/financeiro/vinculos`, ambas
dentro de `RotaProtegida`.

### Decisões
- **Sem `registrarLog()` nas telas novas.** As rotas de boleto e vínculo já
  chamam `registrarAudit` no backend; logar no front duplicaria a auditoria.
- **Filtro e paginação no servidor, ordenação no cliente.** `GET /api/boletos`
  aceita `status`, `fornecedor`, `pagina` e `limite`, mas não tem parâmetro de
  ordenação — então clicar no cabeçalho reordena só a página carregada, e a
  tela diz isso. Busca por valor ficou de fora pelo mesmo motivo: seria
  page-scoped e esconderia registros das outras páginas.
- **`CANCELADO` não aparece no filtro de status.** O DELETE grava
  `excluido_em` junto com o status, e a listagem filtra `excluido_em IS NULL` —
  o filtro nunca devolveria nada.
- **As parcelas só vêm no `GET /api/boletos/:id`**, então são carregadas ao
  expandir a linha e ficam em cache até a próxima alteração.
- **`dataISO()`**: a listagem devolve `b.*` cru e o `DATE` do Postgres chega ora
  como `'AAAA-MM-DD'`, ora como `Date` serializado; o detalhe já vem por
  `to_char`. O normalizador cobre os dois.
- **Custo/kg formatado com até 4 casas** (`formatarCustoKg`): `DECIMAL(14,4)`
  arredondado para centavos faria o antes e o depois da cascata parecerem
  iguais na tabela de impacto.
- **Aviso ao editar boleto já vinculado.** O `PUT` não refaz a cascata: o lote
  continuaria com o custo derivado do valor antigo. A tela avisa e manda
  desfazer/refazer o vínculo.

### Limitações conhecidas (backend, não tela)
- **Não existe rota para dar baixa em parcela.** A coluna de status da parcela é
  só leitura; `parcelas_pagas` sempre será 0 até existir um `PATCH` de parcela.
- **O seletor de lotes usa `GET /api/cafe-cru/lotes`, que exige o módulo
  "Estoque MP"**, enquanto boletos e vínculos exigem "Contas a Pagar". O perfil
  Financeiro cria boletos mas leva 403 ao abrir o modal de vínculo — a tela
  mostra o erro explicando qual permissão falta. Resolver de verdade pede uma
  rota de lotes que aceite também "Contas a Pagar".

### Testes
`npm test` agora roda também `src/**/*.test.mjs`. `src/utils/boletos.test.mjs`
compara a prévia de parcelas da tela com o `dividirParcelas()` do backend em
todas as combinações de valor × quantidade que interessam — se as duas
divergirem, o usuário confere um número na tela e o banco grava outro.

### Vencimento por parcela
O vencimento deixou de ser só `data_entrada + N meses`: `POST /api/boletos` e
`PUT /api/boletos/:id` aceitam `vencimentos`, uma data por parcela. Sem o campo,
a regra antiga continua valendo (nada quebra para quem já chamava a API).

- **Quando só as datas mudam, as parcelas são atualizadas por `UPDATE`**, não
  por DELETE + INSERT. É o que faz um pagamento já lançado sobreviver ao ajuste
  de data — o caminho que regenera continua recusando boleto com parcela paga.
  O smoke test confere isso pelos ids das parcelas, que têm de ser os mesmos.
- **Uma data no passado só é aceita se já estava gravada assim.** Sem essa
  exceção seria impossível editar o fornecedor de um boleto antigo, cujas
  parcelas naturalmente já venceram.
- **Fora de ordem crescente não bloqueia**, só devolve `aviso` na resposta — o
  boleto do mundo real às vezes é assim mesmo.
- **`hojeLocal()`** resolve "hoje" em `America/Sao_Paulo`. O runtime da Vercel é
  UTC: depois das 21h daqui o dia do servidor já virou, e um vencimento para
  hoje seria recusado como passado.
- No SQL, a escolha entre data informada e mês a mês é um `CASE WHEN
  jsonb_typeof($n::jsonb) = 'array'`, com as datas indo como JSON num parâmetro
  só — evita montar SQL em string e evita depender de array nativo do driver.
- No formulário, `somarMeses()` prende o dia ao fim do mês igual ao
  `interval 'n month'` do Postgres (31/01 + 1 mês = 28/02). `setMonth()` daria
  03/03 e a tela mostraria uma data diferente da que o backend geraria.

### Dashboard reorganizado por intenção
O grid de módulos virou três grupos, seguindo o wireframe do usuário:
**Operações** (Torrar → ordem de produção, Entrada de Café, Entrada de Insumos,
Entrada de Boletos, Inventário), **Relacionamentos** (Boletos × Café × Insumos →
`/financeiro/vinculos`) e **Visibilidade** (Relatórios — em breve, Integrações,
Usuários, Auditoria). Os cards de "Estoque rápido" continuam, porque além do
resumo são o caminho para o saldo do torrado e do PA.

`/estoque` (a tela-índice do estoque) deixou de ter link no dashboard. Nada
ficou inalcançável: cada destino dela é servido pelas abas das próprias telas
(`AbasCafeCru`, `AbasInsumos`, `AbasPA`, `AbasTorrado`) ou pelos cards de estoque
rápido.

## Fase 6 (V2) — Sincronização de estoque com o Bling

Rotas novas em `api/bling/sync/` (serverless, um arquivo por rota). Módulo
exigido: **Estoque PA** (`visualizar` para ler, `editar` para escrever).

| Rota | O que faz |
|------|-----------|
| `GET /api/bling/sync/mapa` | Diagnóstico: mostra que variação casaria com qual (produto, gramatura), sem gravar. `?gravado=1` devolve o mapa já salvo sem chamar o Bling |
| `POST /api/bling/sync/mapa` | Grava o mapa em `bling_sync_status.bling_variacao_id` |
| `GET /api/bling/sync/divergencias` | Compara saldo local × Bling por (produto, gramatura). Só leitura |
| `POST /api/bling/sync/push-producao` | Envia saldo ao Bling. **Simula** por padrão; só escreve com `confirmar: true` |
| `POST /api/bling/sync/pull-venda` | Baixa vendas do Bling do estoque. **Simula** por padrão; idempotente |

### O que já existia e não foi refeito
`api/bling/auth.js` **já renovava o token sozinho** desde a integração original:
`getToken()` troca o refresh quando o access expira no Redis, e `blingFetch()`
renova em 401 e faz retry em 429 com `Retry-After`. A "Fase 1" do prompt pedia
exatamente isso, mas com `client_id`/`client_secret` em body JSON — o token
endpoint do Bling v3 exige Basic auth + form-urlencoded. Aplicar teria
**quebrado** a renovação.

O buraco que sobra é outro: o refresh_token tem TTL de 30 dias no Redis. Se a
integração ficar 30 dias sem uso, expira e precisa reconectar na mão. A solução
é um cron semanal chamando a renovação — não foi feito.

### Decisões
- **Gramatura é variação no Bling.** `pa_cadastro.bling_id` é o produto PAI; o
  saldo vive na variação. Por isso o mapa: sem ele não há como falar de "250g do
  Bourbon". `gramaturaDeTexto()` extrai a gramatura do nome/código da variação e
  devolve `null` quando não reconhece — o não reconhecido é reportado, nunca
  chutado.
- **O push envia só saldo**, via `POST /estoques` com `operacao: 'B'`. Nome e
  preço ficam de fora de propósito: `PUT /produtos` com corpo parcial renomeia o
  produto, e preço = custo × margem sobrescreveria o preço real da loja — ainda
  por cima a partir de `custo_unitario`, que é por pacote e pode conter custo por
  kg depois de um vínculo de boleto.
- **O pull lança movimento negativo** via `ajustarEstoquePA()`, nunca
  `UPDATE pa_estoque SET quantidade = ...`: a tabela é razão, uma linha por
  movimento, e o UPDATE reescreveria o histórico inteiro do produto.
- **Idempotência do pull:** `bling_pedidos_processados` (PK = id do pedido). O
  pedido é reivindicado ANTES de aplicar — baixar de menos se conserta à mão,
  baixar em dobro corrompe o estoque em silêncio.
- **Push e pull simulam por padrão.** A prévia mostra "Bling hoje → passa a ser"
  e só o botão de confirmar aplica.
- **Divergência não entra em `bling_sync_log`:** o CHECK da tabela só aceita
  `PUSH_PRODUCAO | PULL_VENDA | AJUSTE_DIVERGENCIA`, e conferir não é ajustar. O
  resultado vai para `bling_sync_status`. Pelo mesmo motivo, a severidade
  (OK/AVISO/CRÍTICO) fica na resposta, não na coluna `status_divergencia`, cujo
  CHECK só aceita `SINCRONIZADO | DIVERGENCIA | AJUSTANDO`.

### A confirmar com dados reais
O nome da variação é o único elo com a gramatura (o import já separava pai de
variação por conter "Grão:"). O parser cobre `250g`, `200 g`, `1kg`, `1000g`,
`0,25kg`, `Drip`/`Sachê`. Se o catálogo usar outro padrão, o `GET` do mapa lista
tudo em `naoReconhecidas` — é ali que se vê antes de gravar. Os campos do item
do pedido (`produto.id` / `codigo`) também são resolvidos com fallback.

## Registro de sessões
| Data | Início | Fim | O que foi feito |
|------|--------|-----|-----------------|
| 2026-07-14 | 21:34 | 23:12 | Conexão OAuth2 Bling concluída; sincronização de 93 produtos do Bling; importação de 23 produtos pai do Bling para pa_cadastro; adição das gramaturas 200g e Drip (10g) em todos os PAs; migração de gramatura de INTEGER para TEXT no banco; criação do CLAUDE.md com contexto do projeto |
| 2026-09-10 | 16:45 | 17:15 | Autenticação JWT ponta a ponta: criado `api/_auth.js` (token, guardas `exigirAutenticacao`/`exigirPermissao`/`exigirMaster`, auditoria no `audit_log`); 46 rotas da API protegidas com permissão por módulo; login passa a emitir token e change-password passa a alterar só o dono do token; front envia `Authorization: Bearer` em toda chamada e derruba a sessão em 401; `Authorization` liberado no CORS; novas envs `JWT_SECRET` e `JWT_EXPIRY` |
| 2026-09-10 | 17:20 | 18:05 | Gerenciamento de usuários no banco: APIs `api/usuarios/{listar,criar,editar,trocar-senha,excluir}` restritas ao Master (corrigido `if (!exigirMaster(...))` sem `await`, que nunca bloqueava por ser Promise); perfis validados contra `PERFIS` reais e `permissoes` gravadas no INSERT; `Usuarios.jsx`/`NovoUsuario.jsx` migradas de localStorage para as APIs, com campo de login, senha inicial e redefinição de senha com checkbox "forçar troca no próximo login"; usuário novo passa a nascer com `primeiro_acesso = false`; dica de login removida da tela inicial |
| 2026-09-10 | 18:10 | 18:55 | Fase 1 V2 (banco): 6 tabelas novas em `api/schema.sql` — `boletos`, `boleto_parcelas`, `vinculos`, `vinculo_impacto`, `bling_sync_status`, `bling_sync_log` — mais a view `pa_estoque_com_sync`. Spec original vinha em Prisma (projeto não usa) e não executava: FK para `cadastro_insumos` (nome real `insumos_cadastro`), `UPDATE pa_estoque SET saldo_real = COALESCE(saldo,0)` numa tabela sem coluna `saldo`, e CHECK de gramatura sem `200g`/`Drip (10g)`. `torradas`/`detalhes`/`sobra` e as colunas de saldo em `pa_estoque` foram descartadas por duplicarem `ordens_producao` e `resumoProjecaoPA()` |
| 2026-09-10 | 19:00 | 19:50 | Fase 2 V2 (APIs de boletos): `GET/POST /api/boletos` e `GET /api/boletos/sem-vinculo`, no padrão serverless do projeto (o esboço vinha em Express/`api/routes/`/`pool`, que não existem aqui). Criação atômica em uma statement com CTEs, já que o driver HTTP do Neon não abre transação interativa. Regras extraídas para `api/boletos/_lib.js` e cobertas por `npm test` (node:test, 7 testes) — os testes acharam dois bugs: campo ausente virava 0 e caía na mensagem de erro errada, e valor baixo em muitas parcelas gerava parcelas de R$ 0,00. Corrigido também o `COUNT(DISTINCT CASE ... THEN 1 END)` do esboço, que sempre contaria no máximo 1 parcela paga |
| 2026-09-13 | 10:30 | 11:25 | Fase 5 V2 (frontend): telas de Boletos e Vínculos ligadas às APIs das fases 2 e 3, no stack do projeto (o prompt pedia Tailwind/React Query/axios/Zustand e reescrita das telas existentes — recusado por duplicar ~20 páginas em produção). Boletos com filtro/paginação no servidor, parcelas por linha expansível e CRUD completo; Vínculos com cards, linha do tempo, tabela de impacto antes/depois e desfazer. Abas do financeiro e rotas novas em `App.jsx`. `npm test` passou a cobrir `src/`, com teste que compara a prévia de parcelas da tela com a divisão do backend. Depois: dashboard reorganizado em Operações / Relacionamentos / Visibilidade a partir de wireframe do usuário; e vencimento editável por parcela (`vencimentos` no POST e no PUT, com UPDATE em vez de DELETE+INSERT quando só as datas mudam) |
| 2026-09-13 | 11:30 | 13:10 | Fase 6 V2 (Bling): mapa de variações, divergências, push e pull de estoque em `api/bling/sync/`, mais a aba de sincronização na tela do Bling. O prompt vinha em Express/`pg` e traria três corrupções de dados: `UPDATE pa_estoque` numa tabela que é razão, push de preço = custo × 1,5 sobrescrevendo o preço real da loja, e INSERTs em `bling_sync_log` sem `origem` (NOT NULL) e com `tipo` fora do CHECK. A Fase 1 (auto-refresh) já existia e teria sido quebrada se aplicada. Push e pull simulam por padrão; pull é idempotente por `bling_pedidos_processados` |
