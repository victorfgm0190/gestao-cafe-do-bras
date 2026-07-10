import { useNavigate } from 'react-router-dom'
import Topbar from '../../components/Topbar'
import './EstoqueIndex.css'

const SUBMODULOS = [
  {
    chave: 'entrada',
    nome: 'Entrada de café cru',
    descricao: 'Registro de recebimento de café verde por saca ou peso.',
    icone: '🌱',
    rota: '/estoque/entrada-cafe',
    disponivel: true,
  },
  {
    chave: 'kardex',
    nome: 'Kardex do café cru',
    descricao: 'Movimentações, custo médio ponderado e exportação.',
    icone: '📒',
    rota: '/estoque/kardex',
    disponivel: true,
  },
  {
    chave: 'saldo',
    nome: 'Saldo atual',
    descricao: 'Saldo em kg e custo médio atual do café cru.',
    icone: '📋',
    rota: '/estoque/saldo',
    disponivel: true,
  },
]

export default function EstoqueIndex() {
  const navigate = useNavigate()

  function abrir(sub) {
    if (sub.disponivel && sub.rota) navigate(sub.rota)
  }

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="est-cabecalho">
          <div className="est-breadcrumb">Estoque</div>
          <h1 className="est-titulo">Estoque</h1>
          <p className="est-subtitulo">
            Controle de café verde, lotes e movimentações da torrefação.
          </p>
        </div>

        <div className="est-grid">
          {SUBMODULOS.map((s) => (
            <button
              key={s.chave}
              className={`est-card ${s.disponivel ? 'disponivel' : 'em-breve'}`}
              onClick={() => abrir(s)}
              disabled={!s.disponivel}
            >
              <div className="est-card-topo">
                <span className="est-card-icone">{s.icone}</span>
                {s.disponivel ? (
                  <span className="est-tag tag-ok">Disponível</span>
                ) : (
                  <span className="est-tag tag-breve">Em breve</span>
                )}
              </div>
              <h3 className="est-card-nome">{s.nome}</h3>
              <p className="est-card-descricao">{s.descricao}</p>
              {s.disponivel && <span className="est-card-acao">Acessar →</span>}
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}
