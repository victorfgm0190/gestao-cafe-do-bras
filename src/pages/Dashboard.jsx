import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Topbar from '../components/Topbar'
import { getUsuario } from '../utils/auth'
import { ehMaster } from '../utils/permissoes'
import { formatarKg, formatarMoeda } from '../utils/formato'
import { lotesCruDisponiveis, resumoPAEstoque, formatarGramatura, pesoGramas } from '../utils/pa'
import { carregarEstoqueTorrado } from '../utils/torrado'
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
    chave: 'inventario',
    nome: 'Inventário',
    descricao: 'Contagem física, diferenças e regularização.',
    icone: '📋',
    rota: '/inventario',
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
    chave: 'integracoes',
    nome: 'Integrações',
    descricao: 'Bling: pedidos, produtos, estoque e financeiro.',
    icone: '🔗',
    rota: '/integracoes/bling',
    disponivel: true,
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

  // Resumo de estoque rápido
  const [cruKg, setCruKg] = useState(0)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const lotes = await lotesCruDisponiveis()
      if (vivo) {
        setCruKg(lotes.reduce((s, l) => s + (Number(l.saldoDisponivel) || 0), 0))
      }
    })()
    return () => {
      vivo = false
    }
  }, [])
  const [torrado, setTorrado] = useState({ saldoAtual: 0, custoMedio: 0 })
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const r = await carregarEstoqueTorrado()
      if (vivo) setTorrado(r)
    })()
    return () => {
      vivo = false
    }
  }, [])
  const [embalados, setEmbalados] = useState([])
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const r = await resumoPAEstoque()
      if (vivo) {
        setEmbalados(
          r
            .filter((x) => x.quantidade > 0)
            .sort(
              (a, b) =>
                (a.paNome || '').localeCompare(b.paNome || '') || pesoGramas(a.gramatura) - pesoGramas(b.gramatura),
            ),
        )
      }
    })()
    return () => {
      vivo = false
    }
  }, [])

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

        {/* Estoque rápido */}
        <h2 className="dash-secao">Estoque rápido</h2>
        <div className="dash-estoque">
          <div className="dash-eq-card" onClick={() => navigate('/estoque/entrada-cafe')}>
            <span className="dash-eq-icone">🌱</span>
            <span className="dash-eq-label">Café in natura</span>
            <strong className="dash-eq-valor">{formatarKg(cruKg)}</strong>
            <span className="dash-eq-nota">Saldo disponível dos lotes</span>
          </div>

          <div className="dash-eq-card" onClick={() => navigate('/estoque/torrado/saldo')}>
            <span className="dash-eq-icone">🔥</span>
            <span className="dash-eq-label">Café torrado</span>
            <strong className="dash-eq-valor">{formatarKg(torrado.saldoAtual)}</strong>
            <span className="dash-eq-nota">
              Custo médio {formatarMoeda(torrado.custoMedio)}/kg
            </span>
          </div>

          <div className="dash-eq-card" onClick={() => navigate('/estoque/pa/estoque')}>
            <span className="dash-eq-icone">☕</span>
            <span className="dash-eq-label">Produtos embalados</span>
            {embalados.length === 0 ? (
              <strong className="dash-eq-valor">—</strong>
            ) : (
              <ul className="dash-eq-lista">
                {embalados.slice(0, 5).map((p) => (
                  <li key={`${p.paId}-${p.gramatura}`}>
                    <span>
                      {p.paNome} {formatarGramatura(p.gramatura)}
                    </span>
                    <strong>{p.quantidade} un</strong>
                  </li>
                ))}
                {embalados.length > 5 && (
                  <li className="dash-eq-mais">+{embalados.length - 5} outros</li>
                )}
              </ul>
            )}
          </div>
        </div>

        <h2 className="dash-secao">Módulos</h2>
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
