import { useNavigate } from 'react-router-dom'
import Topbar from '../../components/Topbar'
import './EstoqueIndex.css'

// Acesso rápido (segunda linha, 2 cards)
const ACESSO_RAPIDO = [
  {
    chave: 'entrada-cru',
    nome: 'Entrada de Café Cru',
    descricao: 'Registrar recebimento de café verde por saca ou peso.',
    icone: '🌱',
    rota: '/estoque/entrada-cafe',
  },
  {
    chave: 'entrada-insumos',
    nome: 'Entrada de Insumos',
    descricao: 'Registrar compra de embalagens, etiquetas e insumos.',
    icone: '📥',
    rota: '/estoque/insumos/entrada',
  },
]

// Gestão (cards menores)
const GESTAO = [
  {
    chave: 'torrado',
    nome: 'Café Torrado',
    descricao: 'Torra do café cru, rendimento e estoque de PP.',
    icone: '🔥',
    rota: '/estoque/torrado',
  },
  {
    chave: 'pa',
    nome: 'Produtos Acabados',
    descricao: 'Cadastro de PA, produção e estoque embalado.',
    icone: '☕',
    rota: '/estoque/pa',
  },
  {
    chave: 'insumos',
    nome: 'Insumos',
    descricao: 'Embalagens, etiquetas, caixas e demais insumos.',
    icone: '🧰',
    rota: '/estoque/insumos',
  },
  {
    chave: 'lotes',
    nome: 'Ver Lotes',
    descricao: 'Café cru: lotes cadastrados e saldos disponíveis.',
    icone: '📋',
    rota: '/estoque/entrada-cafe',
  },
  {
    chave: 'kardex-cru',
    nome: 'Kardex Café Cru',
    descricao: 'Movimentações e custo médio do café cru.',
    icone: '📒',
    rota: '/estoque/kardex',
  },
]

export default function EstoqueIndex() {
  const navigate = useNavigate()

  function Card(sub) {
    return (
      <button key={sub.chave} className="est-card disponivel" onClick={() => navigate(sub.rota)}>
        <div className="est-card-topo">
          <span className="est-card-icone">{sub.icone}</span>
          <span className="est-tag tag-ok">Disponível</span>
        </div>
        <h3 className="est-card-nome">{sub.nome}</h3>
        <p className="est-card-descricao">{sub.descricao}</p>
        <span className="est-card-acao">Acessar →</span>
      </button>
    )
  }

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="est-cabecalho">
          <div className="est-breadcrumb">Estoque</div>
          <h1 className="est-titulo">Estoque</h1>
          <p className="est-subtitulo">
            Controle de café verde, torra, produtos acabados e insumos.
          </p>
        </div>

        {/* Destaque principal */}
        <button className="est-destaque" onClick={() => navigate('/estoque/pa/ordem')}>
          <div className="est-destaque-icone">⚙️</div>
          <div className="est-destaque-txt">
            <h2 className="est-destaque-nome">Ordem de Produção</h2>
            <p className="est-destaque-desc">Registrar torra e embalagem de café</p>
          </div>
          <span className="est-destaque-cta">Iniciar produção →</span>
        </button>

        {/* Acesso rápido */}
        <h2 className="est-secao">Acesso rápido</h2>
        <div className="est-grid est-grid-2">{ACESSO_RAPIDO.map(Card)}</div>

        {/* Gestão */}
        <h2 className="est-secao">Gestão</h2>
        <div className="est-grid">{GESTAO.map(Card)}</div>
      </main>
    </div>
  )
}
