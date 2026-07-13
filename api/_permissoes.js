// Espelho server-side de src/utils/permissoes.js (apenas o necessário para o
// backend). O código serverless NÃO pode importar o util do front porque este
// depende de localStorage. Mantenha as constantes em sincronia com o front.

export const PERFIS = {
  MASTER: 'Master',
  FINANCEIRO: 'Financeiro',
  ESTOQUE: 'Estoque',
  MESTRE_TORRA: 'Mestre de Torra',
  VENDAS: 'Vendas',
  CONSULTA: 'Consulta',
}

export const MODULOS = [
  'Contas a Pagar',
  'Contas a Receber',
  'Fluxo de Caixa',
  'Estoque MP',
  'Estoque PP',
  'Estoque PA',
  'Insumos',
  'Ordem de Torra',
  'Ordem de Embalagem',
  'Inventário',
  'Vendas',
  'Relatórios',
  'Usuários',
  'Auditoria',
]

function perm(visualizar, incluir, editar, excluir, exportar, verCustos) {
  return { visualizar, incluir, editar, excluir, exportar, verCustos }
}
const TUDO = () => perm(true, true, true, true, true, true)
const NENHUMA = () => perm(false, false, false, false, false, false)
const SO_VER = (verCustos = false) => perm(true, false, false, false, true, verCustos)

// Monta o mapa de permissões padrão de um perfil (todos os módulos preenchidos).
export function permissoesPadrao(perfil) {
  const mapa = {}
  MODULOS.forEach((m) => {
    mapa[m] = NENHUMA()
  })

  switch (perfil) {
    case PERFIS.MASTER:
      MODULOS.forEach((m) => {
        mapa[m] = TUDO()
      })
      break
    case PERFIS.FINANCEIRO:
      ;['Contas a Pagar', 'Contas a Receber', 'Fluxo de Caixa'].forEach((m) => {
        mapa[m] = TUDO()
      })
      mapa['Relatórios'] = SO_VER(true)
      break
    case PERFIS.ESTOQUE:
      ;['Estoque MP', 'Estoque PP', 'Estoque PA', 'Insumos', 'Inventário'].forEach((m) => {
        mapa[m] = TUDO()
      })
      mapa['Relatórios'] = SO_VER(false)
      break
    case PERFIS.MESTRE_TORRA:
      ;['Ordem de Torra', 'Ordem de Embalagem', 'Estoque PP', 'Estoque PA'].forEach((m) => {
        mapa[m] = TUDO()
      })
      break
    case PERFIS.VENDAS:
      mapa['Vendas'] = TUDO()
      mapa['Estoque PA'] = SO_VER(false)
      break
    case PERFIS.CONSULTA:
      MODULOS.forEach((m) => {
        if (m !== 'Usuários' && m !== 'Auditoria') mapa[m] = SO_VER(false)
      })
      break
    default:
      break
  }
  return mapa
}
