import { getUsuario } from './auth'

const CHAVE_USUARIOS = 'cafe_do_bras_usuarios'

/* ---------- Perfis de acesso ---------- */
export const PERFIS = {
  MASTER: 'Master',
  FINANCEIRO: 'Financeiro',
  ESTOQUE: 'Estoque',
  MESTRE_TORRA: 'Mestre de Torra',
  VENDAS: 'Vendas',
  CONSULTA: 'Consulta',
}

export const LISTA_PERFIS = [
  { chave: PERFIS.MASTER, descricao: 'Acesso total, sem restrição.' },
  { chave: PERFIS.FINANCEIRO, descricao: 'Contas a pagar, receber e fluxo de caixa.' },
  { chave: PERFIS.ESTOQUE, descricao: 'MP, PP, PA, insumos e inventário.' },
  { chave: PERFIS.MESTRE_TORRA, descricao: 'Ordens de torra e embalagem, PP e PA.' },
  { chave: PERFIS.VENDAS, descricao: 'Vendas, clientes e PA (consulta).' },
  { chave: PERFIS.CONSULTA, descricao: 'Somente visualização do que for liberado.' },
]

/* ---------- Módulos e permissões configuráveis ---------- */
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

export const PERMISSOES = [
  { chave: 'visualizar', rotulo: 'Visualizar' },
  { chave: 'incluir', rotulo: 'Incluir' },
  { chave: 'editar', rotulo: 'Editar' },
  { chave: 'excluir', rotulo: 'Excluir' },
  { chave: 'exportar', rotulo: 'Exportar' },
  { chave: 'verCustos', rotulo: 'Ver custos e margens' },
]

// Cria um objeto de permissões para um módulo
function perm(visualizar, incluir, editar, excluir, exportar, verCustos) {
  return { visualizar, incluir, editar, excluir, exportar, verCustos }
}
const TUDO = () => perm(true, true, true, true, true, true)
const NENHUMA = () => perm(false, false, false, false, false, false)
// Só leitura (visualizar + exportar); custos configurável
const SO_VER = (verCustos = false) => perm(true, false, false, false, true, verCustos)

// Monta o mapa de permissões padrão de um perfil (todos os módulos preenchidos)
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
      mapa['Estoque PA'] = SO_VER(false) // só consulta
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

/* ---------- Força da senha ---------- */
export function forcaSenha(senha) {
  const s = String(senha || '')
  if (!s) return { nivel: 'fraca', rotulo: 'Fraca', score: 0 }
  let score = 0
  if (s.length >= 6) score++
  if (s.length >= 10) score++
  if (/[a-z]/.test(s) && /[A-Z]/.test(s)) score++
  if (/\d/.test(s)) score++
  if (/[^A-Za-z0-9]/.test(s)) score++
  if (score <= 2) return { nivel: 'fraca', rotulo: 'Fraca', score }
  if (score <= 3) return { nivel: 'media', rotulo: 'Média', score }
  return { nivel: 'forte', rotulo: 'Forte', score }
}

/* ---------- Data/hora local ---------- */
function agora() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const data = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  const hora = `${p(d.getHours())}:${p(d.getMinutes())}`
  return { data, hora, dataHora: `${data} ${hora}` }
}

/* ---------- Usuário padrão (seed) ---------- */
function usuarioPadrao() {
  const { data } = agora()
  return {
    id: 1,
    nome: 'Administrador',
    email: 'admin@cafedobras.com.br',
    telefone: '',
    senha: 'admin',
    status: 'ativo',
    perfil: PERFIS.MASTER,
    permissoes: permissoesPadrao(PERFIS.MASTER),
    dataCriacao: data,
    ultimoAcesso: null,
    protegido: true,
  }
}

/* ---------- Persistência de usuários ---------- */
export function carregarUsuarios() {
  try {
    const bruto = localStorage.getItem(CHAVE_USUARIOS)
    if (!bruto) {
      const inicial = [usuarioPadrao()]
      localStorage.setItem(CHAVE_USUARIOS, JSON.stringify(inicial))
      return inicial
    }
    const dado = JSON.parse(bruto)
    if (Array.isArray(dado) && dado.length > 0) return dado
    const inicial = [usuarioPadrao()]
    localStorage.setItem(CHAVE_USUARIOS, JSON.stringify(inicial))
    return inicial
  } catch {
    return [usuarioPadrao()]
  }
}

export function salvarUsuarios(lista) {
  localStorage.setItem(CHAVE_USUARIOS, JSON.stringify(lista))
}

export function proximoIdUsuario(lista) {
  return lista.reduce((max, u) => Math.max(max, u.id), 0) + 1
}

/* ---------- Autenticação / sessão ---------- */
// Valida credenciais e atualiza o último acesso. Retorna o usuário ou null.
export function autenticarUsuario(identificador, senha) {
  const ident = String(identificador || '').trim().toLowerCase()
  const usuarios = carregarUsuarios()
  const u = usuarios.find((x) => {
    const casaIdent =
      x.email.toLowerCase() === ident ||
      x.nome.toLowerCase() === ident ||
      (ident === 'admin' && x.email === 'admin@cafedobras.com.br')
    return casaIdent && x.senha === senha && x.status === 'ativo'
  })
  if (!u) return null

  const { dataHora } = agora()
  const atualizados = usuarios.map((x) =>
    x.id === u.id ? { ...x, ultimoAcesso: dataHora } : x,
  )
  salvarUsuarios(atualizados)
  return { ...u, ultimoAcesso: dataHora }
}

// Usuário atualmente logado (objeto completo com perfil e permissões atuais)
export function usuarioLogado() {
  const auth = getUsuario()
  if (!auth) return null
  const usuarios = carregarUsuarios()
  if (auth.email) {
    const u = usuarios.find((x) => x.email === auth.email)
    if (u) return u
  }
  // Compatibilidade com sessões antigas que guardavam apenas 'admin'
  if (auth.usuario === 'admin' || auth.usuario === 'Administrador') {
    return usuarios.find((x) => x.perfil === PERFIS.MASTER) || null
  }
  return usuarios.find((x) => x.nome === auth.usuario) || null
}

export function ehMaster() {
  return usuarioLogado()?.perfil === PERFIS.MASTER
}

export function nomeUsuarioAtual() {
  const auth = getUsuario()
  return auth?.usuario || usuarioLogado()?.nome || 'sistema'
}
