import { useNavigate } from 'react-router-dom'
import Topbar from '../components/Topbar'
import { getUsuario } from '../utils/auth'
import { ehMaster } from '../utils/permissoes'
import './Dashboard.css'

const MODULOS = [
  {
    chave: 'financeiro',
    nome: 'Financeiro',
    descricao: 'Contas a pagar, receber e fluxo de caixa.',
    icone: '💰',
    rota: '/financeiro/contas-pagar',
    disponivel: true,
  },
  {
    chave: 'estoque',
    nome: 'Estoque',
    descricao: 'Café verde, embalagens e insumos.',
    icone: '📦',
    rota: '/estoque',
    disponivel: true,
  },
  {
    chave: 'torrefacao',
    nome: 'Torrefação',
    descricao: 'Perfis de torra, lotes e curvas.',
    icone: '🔥',
    disponivel: false,
  },
  {
    chave: 'vendas',
    nome: 'Vendas',
    descricao: 'Pedidos, clientes e faturamento.',
    icone: '🛒',
    disponivel: false,
  },
  {
    chave: 'relatorios',
    nome: 'Relatórios',
    descricao: 'Indicadores e análises do negócio.',
    icone: '📊',
    disponivel: false,
  },
  {
    chave: 'usuarios',
    nome: 'Usuários',
    descricao: 'Usuários, perfis e permissões de acesso.',
    icone: '👥',
    rota: '/usuarios',
    disponivel: true,
    soMaster: true,
  },
  {
    chave: 'auditoria',
    nome: 'Auditoria',
    descricao: 'Log imutável de operações do sistema.',
    icone: '🛡️',
    rota: '/auditoria',
    disponivel: true,
    soMaster: true,
  },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const usuario = getUsuario()
  const master = ehMaster()

  // Módulos administrativos (soMaster) só aparecem para o perfil Master
  const modulosVisiveis = MODULOS.filter((m) => !m.soMaster || master)

  function abrir(modulo) {
    if (modulo.disponivel && modulo.rota) {
      navigate(modulo.rota)
    }
  }

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="dash-cabecalho">
          <div>
            <h1 className="dash-titulo">Olá, {usuario?.usuario || 'admin'} 👋</h1>
            <p className="dash-subtitulo">
              Bem-vindo ao painel de gestão da microtorrefação Café do Brás.
            </p>
          </div>
        </div>

        <div className="dash-grid">
          {modulosVisiveis.map((m) => (
            <button
              key={m.chave}
              className={`modulo-card ${m.disponivel ? 'disponivel' : 'em-breve'}`}
              onClick={() => abrir(m)}
              disabled={!m.disponivel}
            >
              <div className="modulo-topo">
                <span className="modulo-icone">{m.icone}</span>
                {m.disponivel ? (
                  <span className="modulo-tag tag-ok">Disponível</span>
                ) : (
                  <span className="modulo-tag tag-breve">Em breve</span>
                )}
              </div>
              <h3 className="modulo-nome">{m.nome}</h3>
              <p className="modulo-descricao">{m.descricao}</p>
              {m.disponivel && <span className="modulo-acao">Acessar →</span>}
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}
