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

## Registro de sessões
| Data | Início | Fim | O que foi feito |
|------|--------|-----|-----------------|
| 2026-07-14 | 21:34 | 23:12 | Conexão OAuth2 Bling concluída; sincronização de 93 produtos do Bling; importação de 23 produtos pai do Bling para pa_cadastro; adição das gramaturas 200g e Drip (10g) em todos os PAs; migração de gramatura de INTEGER para TEXT no banco; criação do CLAUDE.md com contexto do projeto |
| 2026-09-10 | 16:45 | 17:15 | Autenticação JWT ponta a ponta: criado `api/_auth.js` (token, guardas `exigirAutenticacao`/`exigirPermissao`/`exigirMaster`, auditoria no `audit_log`); 46 rotas da API protegidas com permissão por módulo; login passa a emitir token e change-password passa a alterar só o dono do token; front envia `Authorization: Bearer` em toda chamada e derruba a sessão em 401; `Authorization` liberado no CORS; novas envs `JWT_SECRET` e `JWT_EXPIRY` |
| 2026-09-10 | 17:20 | 18:05 | Gerenciamento de usuários no banco: APIs `api/usuarios/{listar,criar,editar,trocar-senha,excluir}` restritas ao Master (corrigido `if (!exigirMaster(...))` sem `await`, que nunca bloqueava por ser Promise); perfis validados contra `PERFIS` reais e `permissoes` gravadas no INSERT; `Usuarios.jsx`/`NovoUsuario.jsx` migradas de localStorage para as APIs, com campo de login, senha inicial e redefinição de senha com checkbox "forçar troca no próximo login"; usuário novo passa a nascer com `primeiro_acesso = false`; dica de login removida da tela inicial |
