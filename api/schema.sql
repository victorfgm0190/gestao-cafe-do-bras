-- ============================================================================
-- Schema do sistema Gestão Café do Brás — PostgreSQL (Neon)
-- ----------------------------------------------------------------------------
-- Migração do localStorage → PostgreSQL. Todo o DDL é idempotente
-- (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS): rodar mais de uma
-- vez é seguro.
--
-- Convenções:
--   • Colunas em snake_case; enums do app guardados como VARCHAR (a validação
--     continua na aplicação, como hoje).
--   • Datas de negócio (recebimento, movimentações) → DATE (ISO 'YYYY-MM-DD').
--     Carimbos de auditoria interna → TIMESTAMP (criado_em DEFAULT NOW()).
--   • Pesos/quantidades → DECIMAL(14,3); preços/custos unitários → DECIMAL(14,4);
--     custos totais → DECIMAL(14,2).
--
-- Modelagem híbrida (decisão consciente):
--   As entidades "planas" (lotes, kardex, insumos, PA, torras, movimentações,
--   auditoria) viram tabelas normalizadas com FKs. As estruturas profundamente
--   aninhadas e heterogêneas que o app sempre lê/grava como bloco único e
--   recalcula em JS — ordens de produção (lotes[]/itens[]), itens de inventário
--   (com regularização e identificadores condicionais por categoria), o mapa de
--   permissões por módulo e o mapa de estoque mínimo — ficam em colunas JSONB.
--   Isso mantém a migração fiel ao modelo atual sem uma reescrita de baixo nível.
-- ============================================================================


-- ============================================================================
-- USUÁRIOS E AUTENTICAÇÃO
-- Origem: cafe_do_bras_usuarios (permissoes.js). senha em texto puro no
-- localStorage → aqui vira password_hash (a fazer no passo de migração de dados).
-- ============================================================================
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  username VARCHAR(120) UNIQUE NOT NULL,     -- login (e-mail ou nome); único
  email VARCHAR(120),
  telefone VARCHAR(30),
  password_hash VARCHAR(255) NOT NULL,
  nome VARCHAR(100) NOT NULL,
  perfil VARCHAR(50) NOT NULL,               -- Master | Financeiro | Estoque | Mestre de Torra | Vendas | Consulta
  permissoes JSONB NOT NULL DEFAULT '{}',    -- { [modulo]: { visualizar, incluir, editar, excluir, exportar, verCustos } }
  primeiro_acesso BOOLEAN NOT NULL DEFAULT true,
  protegido BOOLEAN NOT NULL DEFAULT false,  -- true = não pode ser excluído (admin seed)
  ativo BOOLEAN NOT NULL DEFAULT true,        -- status 'ativo'/'inativo'
  ultimo_acesso TIMESTAMP,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- AUDIT LOG
-- Origem: cafe_do_bras_auditoria (auditoria.js). Append-only.
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  usuario VARCHAR(100) NOT NULL DEFAULT 'sistema',
  acao VARCHAR(100) NOT NULL,                -- Login, Logout, Incluiu, Alterou, Excluiu, ...
  modulo VARCHAR(50),
  detalhes TEXT,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_criado_em ON audit_log (criado_em DESC);


-- ============================================================================
-- CAFÉ CRU (MP) — LOTES
-- Origem: cafe_do_bras_estoque (EntradaCafe.jsx). fazenda = produtor.
-- ============================================================================
CREATE TABLE IF NOT EXISTS lotes_cafe_cru (
  id SERIAL PRIMARY KEY,
  codigo_lote VARCHAR(20) UNIQUE NOT NULL,   -- ex.: LC-2026-001
  data_entrada DATE NOT NULL,                -- recebimento
  tipo_entrada VARCHAR(20),                  -- 'saca' | 'personalizado'
  sacas DECIMAL(14,3),
  peso_kg DECIMAL(14,3) NOT NULL,            -- pesoTotal
  tipo_cafe VARCHAR(40),                     -- Arábica | Canephora (Robusta) | Blend
  fazenda VARCHAR(100) NOT NULL,             -- produtor (compõe o grupo de custeio)
  cidade VARCHAR(100),
  estado VARCHAR(2),
  variedade VARCHAR(100) NOT NULL,           -- compõe o grupo de custeio
  processo VARCHAR(40),                      -- Natural | Lavado | Honey | Cereja Descascado
  safra VARCHAR(10),
  qualidade VARCHAR(20),
  umidade VARCHAR(20),
  custo_total DECIMAL(14,2) NOT NULL,
  preco_kg DECIMAL(14,4) NOT NULL,           -- custoPorKg = custo_total / peso_kg
  nota_fiscal VARCHAR(60),
  fornecedor VARCHAR(120),
  deposito VARCHAR(60),
  saldo_disponivel DECIMAL(14,3) NOT NULL DEFAULT 0,  -- baixado por torras/ordens
  status VARCHAR(20) NOT NULL DEFAULT 'disponivel',   -- disponivel | esgotado
  observacoes TEXT,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lotes_cru_grupo ON lotes_cafe_cru (fazenda, variedade);


-- ============================================================================
-- CAFÉ CRU (MP) — CADASTRO FORMAL DE CAFÉS
-- Origem: cafes_cru_cadastro (CafeCruCadastro.jsx). Catálogo canônico de
-- fazenda + variedade + processo, usado para padronizar a Entrada de café cru
-- e vincular cafés a produtos acabados (pa_ids).
-- ============================================================================
CREATE TABLE IF NOT EXISTS cafes_cru_cadastro (
  id SERIAL PRIMARY KEY,
  fazenda TEXT NOT NULL,
  variedade TEXT NOT NULL,
  processo TEXT NOT NULL DEFAULT 'Natural',   -- Natural | Lavado | Honey
  pa_ids JSONB,                               -- array de pa_cadastro.id vinculados (opcional)
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================================
-- CAFÉ CRU (MP) — KARDEX (ledger)
-- Origem: kardex_cafe_cru (kardex.js). Custo médio corrido DENTRO de cada
-- grupo (fazenda + variedade). quantidade tem sinal (+ entra / - sai).
-- ============================================================================
CREATE TABLE IF NOT EXISTS kardex_cafe_cru (
  id SERIAL PRIMARY KEY,
  data DATE NOT NULL,
  tipo VARCHAR(20) NOT NULL,                 -- Entrada | Saída | Ajuste | Perda
  descricao TEXT NOT NULL,
  produtor VARCHAR(100),
  variedade VARCHAR(100),
  grupo VARCHAR(220),                        -- `${produtor}|${variedade}` (chave de custeio)
  quantidade DECIMAL(14,3) NOT NULL,         -- com sinal
  custo_unitario DECIMAL(14,4),
  custo_total DECIMAL(14,2),
  saldo_acumulado DECIMAL(14,3) NOT NULL,    -- corrido dentro do grupo
  custo_medio DECIMAL(14,4),                 -- corrido dentro do grupo
  lote_id INTEGER REFERENCES lotes_cafe_cru(id) ON DELETE SET NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kardex_cru_grupo_data ON kardex_cafe_cru (grupo, data, id);


-- ============================================================================
-- INSUMOS — CADASTRO
-- Origem: insumos_cadastro (insumos.js).
-- ============================================================================
CREATE TABLE IF NOT EXISTS insumos_cadastro (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  unidade VARCHAR(10) NOT NULL,              -- un | cx | rolo | kg
  estoque_minimo DECIMAL(14,3) NOT NULL DEFAULT 0,
  descricao TEXT,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- INSUMOS — ENTRADAS (compras)
-- Origem: insumos_entradas (insumos.js). Cada entrada gera 1 mov. no kardex.
-- ============================================================================
CREATE TABLE IF NOT EXISTS insumos_entradas (
  id SERIAL PRIMARY KEY,
  insumo_id INTEGER NOT NULL REFERENCES insumos_cadastro(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  quantidade DECIMAL(14,3) NOT NULL,
  custo_unitario DECIMAL(14,4) NOT NULL,
  fornecedor VARCHAR(120),
  observacao TEXT,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_insumos_entradas_insumo ON insumos_entradas (insumo_id);


-- ============================================================================
-- INSUMOS — KARDEX
-- Origem: kardex_insumos (insumos.js). Custo médio corrido POR insumo.
-- ============================================================================
CREATE TABLE IF NOT EXISTS kardex_insumos (
  id SERIAL PRIMARY KEY,
  insumo_id INTEGER NOT NULL REFERENCES insumos_cadastro(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  tipo VARCHAR(20) NOT NULL,                 -- Entrada | Saída | Ajuste | Perda
  descricao TEXT,
  quantidade DECIMAL(14,3) NOT NULL,         -- com sinal
  custo_unitario DECIMAL(14,4),
  custo_total DECIMAL(14,2),
  saldo_acumulado DECIMAL(14,3) NOT NULL,
  custo_medio DECIMAL(14,4),
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kardex_insumos_insumo_data ON kardex_insumos (insumo_id, data, id);


-- ============================================================================
-- CAFÉ TORRADO (PP) — KARDEX
-- Origem: kardex_cafe_torrado (torrado.js). Fluxo único (não agrupado).
-- O torrado não é comprado: cada torra baixa cru e gera torrado.
-- ============================================================================
CREATE TABLE IF NOT EXISTS kardex_cafe_torrado (
  id SERIAL PRIMARY KEY,
  data DATE NOT NULL,
  tipo VARCHAR(20) NOT NULL,                 -- Entrada | Saída | Ajuste | Perda
  descricao TEXT,
  quantidade DECIMAL(14,3) NOT NULL,         -- com sinal
  custo_unitario DECIMAL(14,4),
  custo_total DECIMAL(14,2),
  saldo_acumulado DECIMAL(14,3) NOT NULL,
  custo_medio DECIMAL(14,4),
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kardex_torrado_data ON kardex_cafe_torrado (data, id);


-- ============================================================================
-- CAFÉ TORRADO (PP) — HISTÓRICO DE TORRAS (Ordem de Torra)
-- Origem: torras_historico (torrado.js). Liga lote de cru → movimentações.
-- ============================================================================
CREATE TABLE IF NOT EXISTS torras_historico (
  id SERIAL PRIMARY KEY,
  data DATE NOT NULL,
  lote_id INTEGER REFERENCES lotes_cafe_cru(id) ON DELETE SET NULL,
  lote_codigo VARCHAR(20),
  produtor VARCHAR(100),
  peso_cru DECIMAL(14,3) NOT NULL,           -- kg baixados do lote
  peso_torrado DECIMAL(14,3) NOT NULL,       -- kg gerados
  perda DECIMAL(14,3),                        -- peso_cru - peso_torrado
  rendimento DECIMAL(14,4),                   -- % = peso_torrado/peso_cru*100
  perfil VARCHAR(20),                         -- Clara | Média | Escura
  observacao TEXT,
  custo_por_kg_lote DECIMAL(14,4),            -- custo médio do grupo no momento
  custo_torrado_unit DECIMAL(14,4),           -- R$/kg do torrado gerado
  mov_cru_id INTEGER REFERENCES kardex_cafe_cru(id) ON DELETE SET NULL,      -- saída gerada
  mov_torrado_id INTEGER REFERENCES kardex_cafe_torrado(id) ON DELETE SET NULL, -- entrada gerada
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_torras_lote ON torras_historico (lote_id);


-- ============================================================================
-- PRODUTO ACABADO (PA) — CADASTRO
-- Origem: pa_cadastro (pa.js). gramaturas = subconjunto de [200,250,1000].
-- ============================================================================
CREATE TABLE IF NOT EXISTS pa_cadastro (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  gramaturas JSONB NOT NULL DEFAULT '[]',    -- ex.: [250, 1000]
  embalagem_250_id INTEGER REFERENCES insumos_cadastro(id) ON DELETE SET NULL,
  embalagem_1000_id INTEGER REFERENCES insumos_cadastro(id) ON DELETE SET NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
-- Perda de torra padrão (%) por produto — sugere o café cru na ordem de produção.
ALTER TABLE pa_cadastro ADD COLUMN IF NOT EXISTS perda_torra_padrao DECIMAL(6,2) NOT NULL DEFAULT 10;
-- Mix de projeção (%) por gramatura — ex.: {"200":10,"250":60,"1000":20,"drip":10} (soma 100).
ALTER TABLE pa_cadastro ADD COLUMN IF NOT EXISTS mix_projecao JSONB;
-- Origem do café: grupos (fazenda + variedade) vinculados ao produto —
-- ex.: [{"fazenda":"Sítio Boa Vista","variedade":"Catuaí"}]. Vazio/null = todo o cru.
ALTER TABLE pa_cadastro ADD COLUMN IF NOT EXISTS cafe_origem_ids JSONB;


-- ============================================================================
-- PRODUTO ACABADO (PA) — ESTOQUE (camadas por produção/ajuste)
-- Origem: pa_estoque (pa.js). O saldo agregado é derivado na aplicação.
-- ============================================================================
CREATE TABLE IF NOT EXISTS pa_estoque (
  id SERIAL PRIMARY KEY,
  pa_id INTEGER REFERENCES pa_cadastro(id) ON DELETE SET NULL,
  gramatura TEXT NOT NULL,                   -- rótulo: "200g" | "250g" | "1kg" | "Drip (10g)"
  quantidade DECIMAL(14,3) NOT NULL,         -- pacotes (pode ser negativo em ajuste)
  custo_unitario DECIMAL(14,4),              -- por pacote (café + embalagem)
  custo_total DECIMAL(14,2),
  data DATE NOT NULL,
  ordem_id INTEGER,                          -- FK lógica → ordens_producao.id (null se inventário)
  origem VARCHAR(20),                        -- 'inventario' nos ajustes; null nas produções
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
-- Migração: gramatura de INTEGER → TEXT (preserva o rótulo, ex.: "Drip (10g)"). Idempotente.
ALTER TABLE pa_estoque ALTER COLUMN gramatura TYPE text;
CREATE INDEX IF NOT EXISTS idx_pa_estoque_pa ON pa_estoque (pa_id, gramatura);


-- ============================================================================
-- PRODUTO ACABADO (PA) — MOVIMENTAÇÕES
-- Origem: pa_movimentacoes (pa.js). pa_nome ausente em ajuste; descricao
-- ausente em produção → ambas nullable.
-- ============================================================================
CREATE TABLE IF NOT EXISTS pa_movimentacoes (
  id SERIAL PRIMARY KEY,
  ordem_id INTEGER,                          -- FK lógica → ordens_producao.id
  data DATE NOT NULL,
  tipo VARCHAR(20) NOT NULL,                 -- Entrada (produção) | Saída/Ajuste (inventário)
  pa_id INTEGER REFERENCES pa_cadastro(id) ON DELETE SET NULL,
  pa_nome VARCHAR(120),
  gramatura TEXT NOT NULL,                   -- rótulo: "200g" | "250g" | "1kg" | "Drip (10g)"
  quantidade DECIMAL(14,3) NOT NULL,         -- com sinal
  custo_unitario DECIMAL(14,4),
  custo_total DECIMAL(14,2),
  descricao TEXT,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
-- Migração: gramatura de INTEGER → TEXT (preserva o rótulo, ex.: "Drip (10g)"). Idempotente.
ALTER TABLE pa_movimentacoes ALTER COLUMN gramatura TYPE text;
CREATE INDEX IF NOT EXISTS idx_pa_mov_pa ON pa_movimentacoes (pa_id, gramatura);


-- ============================================================================
-- ORDENS DE PRODUÇÃO (Embalagem)
-- Origem: ordens_producao (pa.js). Os arrays aninhados lotes[] (cru consumido)
-- e itens[] (por gramatura, com todos os custos derivados e ids de baixa) são
-- sempre lidos/gravados junto com a ordem e recalculados em JS → JSONB.
-- ============================================================================
CREATE TABLE IF NOT EXISTS ordens_producao (
  id SERIAL PRIMARY KEY,
  data DATE NOT NULL,
  pa_id INTEGER REFERENCES pa_cadastro(id) ON DELETE SET NULL,
  pa_nome VARCHAR(120),
  total_cru DECIMAL(14,3),                   -- kg de cru consumidos
  custo_total_cru DECIMAL(14,2),
  total_kg_embalado DECIMAL(14,3),
  custo_kg_embalado DECIMAL(14,4),
  sobra DECIMAL(14,3),                        -- kg de torrado que sobrou (custo zero)
  perda DECIMAL(14,3),
  custo_total_cafe DECIMAL(14,2),
  custo_total_embalagens DECIMAL(14,2),
  custo_total DECIMAL(14,2),
  mov_torrado_id INTEGER REFERENCES kardex_cafe_torrado(id) ON DELETE SET NULL, -- entrada da sobra
  lotes JSONB NOT NULL DEFAULT '[]',         -- [{ loteId, loteCodigo, produtor, variedade, saldoDisponivel, kg, custoPorKg, custoTotalLote, movCruId }]
  itens JSONB NOT NULL DEFAULT '[]',         -- [{ gramatura, quantidade, embaladoKg, embalagemId, embNome, custoUnitario*, custoTotalGramatura, movInsumoId, paEstoqueId, paMovId }]
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ordens_pa ON ordens_producao (pa_id);


-- ============================================================================
-- INVENTÁRIOS
-- Origem: inventarios (inventario.js). itens[] é fortemente heterogêneo
-- (regularizacao aninhada + identificadores condicionais por categoria) → JSONB.
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventarios (
  id SERIAL PRIMARY KEY,
  data DATE NOT NULL,
  tipo VARCHAR(20) NOT NULL,                 -- Diário | Semanal | Mensal
  status VARCHAR(20) NOT NULL DEFAULT 'Rascunho',  -- Rascunho | Concluído
  criado_por VARCHAR(100) NOT NULL DEFAULT 'sistema',
  concluido_em DATE,
  itens JSONB NOT NULL DEFAULT '[]',         -- [{ categoria, referencia, descricao, unidade, saldoSistema, saldoFisico, diferenca, status, regularizado, regularizacao{}, e ids condicionais }]
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- CONFIG — ESTOQUE MÍNIMO
-- Origem: config_estoque_minimo (estoqueMinimo.js). Mapa chave→mínimo.
-- Chaves: 'insumo:<id>', 'torrado', 'pa:<paId>:<gramatura>'.
-- ============================================================================
CREATE TABLE IF NOT EXISTS config_estoque_minimo (
  chave VARCHAR(60) PRIMARY KEY,
  minimo DECIMAL(14,3) NOT NULL DEFAULT 0
);
