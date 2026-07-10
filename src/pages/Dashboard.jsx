import { useNavigate } from 'react-router-dom'
import Topbar from '../components/Topbar'
import { getUsuario } from '../utils/auth'
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
    chave: 'config',
    nome: 'Configurações',
    descricao: 'Usuários, categorias e preferências.',
    icone: '⚙️',
    disponivel: false,
  },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const usuario = getUsuario()

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
          {MODULOS.map((m) => (
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
