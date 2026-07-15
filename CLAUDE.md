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
