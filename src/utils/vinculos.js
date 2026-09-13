// Camada de dados dos vínculos boleto → lote de café cru (Fase 3 da V2).
// O POST dispara a cascata de custo; o DELETE desfaz pelo vinculo_impacto.
// Módulo exigido: "Contas a Pagar" (a auditoria é registrada no backend).
import { getJson, sendJson } from './api'

export const ROTULO_TABELA = {
  lotes_cafe_cru: 'Lote de café cru',
  kardex_cafe_cru: 'Kardex do café cru',
  pa_estoque: 'Estoque de PA',
  boletos: 'Boleto',
}

// Custo por kg é gravado com 4 casas (DECIMAL(14,4)). formatarMoeda() arredonda
// para centavos, o que esconderia a diferença entre o antes e o depois da
// cascata — por isso este formatador próprio.
export function formatarCustoKg(valor) {
  const n = Number(valor) || 0
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
}

export const listarVinculos = () => getJson('/api/vinculos')
export const obterVinculo = (id) => getJson(`/api/vinculos/${id}`)
export const criarVinculo = (dados) => sendJson('/api/vinculos', 'POST', dados)
export const desfazerVinculo = (id) => sendJson(`/api/vinculos/${id}`, 'DELETE')

// Lista de lotes para o seletor de vínculo. ATENÇÃO: esta rota exige o módulo
// "Estoque MP", não "Contas a Pagar" — um usuário do perfil Financeiro recebe
// 403 aqui mesmo podendo criar boletos. As telas tratam esse erro à parte.
export const listarLotesCru = () => getJson('/api/cafe-cru/lotes')

// O impacto em `boletos` guarda o status codificado em coluna DECIMAL:
// 0 = SEM_VINCULO, 1 = VINCULADO (ver api/vinculos.js).
export function descreverImpacto(impacto) {
  const antes = Number(impacto.valor_antes)
  const depois = Number(impacto.valor_depois)
  if (impacto.tabela_afetada === 'boletos') {
    const nome = (v) => (v === 0 ? 'SEM_VINCULO' : 'VINCULADO')
    return { antes: nome(antes), depois: nome(depois), moeda: false }
  }
  return { antes, depois, moeda: true }
}
