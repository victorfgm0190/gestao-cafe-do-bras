import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Topbar from '../components/Topbar'
import { getUsuario } from '../utils/auth'
import { ehMaster } from '../utils/permissoes'
import { formatarKg, formatarMoeda } from '../utils/formato'
import { lotesCruDisponiveis, resumoPAEstoque, resumoProjecaoPA } from '../utils/pa'
import { carregarEstoqueTorrado } from '../utils/torrado'
import './Dashboard.css'

// A navegação é agrupada pelo que o usuário quer FAZER, não por módulo do
// sistema: o que se registra no dia a dia (Operações), o que amarra custo entre
// os registros (Relacionamentos) e o que só se consulta (Visibilidade).
const GRUPOS = [
  {
    chave: 'operacoes',
    titulo: 'Operações',
    icone: '📋',
    itens: [
      {
        chave: 'torrar',
        nome: 'Torrar',
        descricao: 'Ordem de produção: torra, embalagem, perda e custo por unidade.',
        icone: '🔥',
        rota: '/estoque/pa/ordem',
      },
      {
        chave: 'entrada-cafe',
        nome: 'Entrada de Café',
        descricao: 'Recebimento de café verde por saca ou por peso.',
        icone: '☕',
        rota: '/estoque/entrada-cafe',
      },
      {
        chave: 'entrada-insumos',
        nome: 'Entrada de Insumos',
        descricao: 'Compra de embalagens, etiquetas e caixas.',
        icone: '📦',
        rota: '/estoque/insumos/entrada',
      },
      {
        chave: 'entrada-boletos',
        nome: 'Entrada de Boletos',
        descricao: 'Boleto do fornecedor e as parcelas geradas a partir dele.',
        icone: '💰',
        rota: '/financeiro/boletos',
      },
      {
        chave: 'inventario',
        nome: 'Inventário',
        descricao: 'Contagem física, diferenças e regularização.',
        icone: '📊',
        rota: '/inventario',
      },
    ],
  },
  {
    chave: 'relacionamentos',
    titulo: 'Relacionamentos',
    icone: '🔗',
    itens: [
      {
        chave: 'vinculos',
        nome: 'Boletos × Café × Insumos',
        descricao: 'Liga o boleto ao lote e propaga o custo em cascata até o produto embalado.',
        icone: '⛓️',
        rota: '/financeiro/vinculos',
      },
    ],
  },
  {
    chave: 'visibilidade',
    titulo: 'Visibilidade',
    icone: '📈',
    itens: [
      {
        chave: 'relatorios',
        nome: 'Relatórios',
        descricao: 'Indicadores e análises do negócio.',
        icone: '📊',
        disponivel: false,
      },
      {
        chave: 'bling',
        nome: 'Integrações (Bling)',
        descricao: 'Pedidos, produtos, estoque e financeiro.',
        icone: '🔌',
        rota: '/integracoes/bling',
      },
      {
        chave: 'usuarios',
        nome: 'Usuários',
        descricao: 'Usuários, perfis e permissões de acesso.',
        icone: '👥',
        rota: '/usuarios',
        soMaster: true,
      },
      {
        chave: 'auditoria',
        nome: 'Auditoria',
        descricao: 'Log imutável de operações do sistema.',
        icone: '📝',
        rota: '/auditoria',
        soMaster: true,
      },
    ],
  },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const usuario = getUsuario()
  const master = ehMaster()

  // Itens administrativos (soMaster) só aparecem para o perfil Master; um grupo
  // que ficasse sem nenhum item visível não é renderizado.
  const gruposVisiveis = GRUPOS.map((g) => ({
    ...g,
    itens: g.itens.filter((i) => !i.soMaster || master),
  })).filter((g) => g.itens.length > 0)

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
  // Pacotes reais em estoque (soma de todo o pa_estoque).
  const [realPacotes, setRealPacotes] = useState(0)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const r = await resumoPAEstoque()
      if (vivo) setRealPacotes(r.reduce((s, x) => s + (Number(x.quantidade) || 0), 0))
    })()
    return () => {
      vivo = false
    }
  }, [])
  // Pacotes projetados adicionais (soma de projetado_adicional da projeção).
  // null = projeção indisponível → o card mostra só o real.
  const [projetadoPacotes, setProjetadoPacotes] = useState(null)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const proj = await resumoProjecaoPA()
        const soma = proj.reduce(
          (s, p) => s + Object.values(p.projetadoAdicional || {}).reduce((a, b) => a + (Number(b) || 0), 0),
          0,
        )
        if (vivo) setProjetadoPacotes(soma)
      } catch {
        if (vivo) setProjetadoPacotes(null)
      }
    })()
    return () => {
      vivo = false
    }
  }, [])

  function abrir(item) {
    if (item.disponivel !== false && item.rota) {
      navigate(item.rota)
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
            <div className="dash-pa-resumo">
              <div className="dash-pa-linha">
                <span className="dash-pa-rot">Real</span>
                <strong className="dash-pa-real">{realPacotes} un</strong>
              </div>
              {projetadoPacotes != null && (
                <>
                  <div className="dash-pa-linha">
                    <span className="dash-pa-rot">+ Projetado</span>
                    <strong className="dash-pa-proj">{projetadoPacotes} un</strong>
                  </div>
                  <div className="dash-pa-divisor" />
                  <div className="dash-pa-linha total">
                    <span className="dash-pa-rot">= Total site</span>
                    <strong className="dash-pa-total">{realPacotes + projetadoPacotes} un</strong>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {gruposVisiveis.map((g) => (
          <section key={g.chave} className="dash-grupo">
            <h2 className="dash-secao">
              <span className="dash-grupo-icone">{g.icone}</span> {g.titulo}
            </h2>
            <div className="dash-grupo-itens">
              {g.itens.map((i) => {
                const disponivel = i.disponivel !== false
                return (
                  <button
                    key={i.chave}
                    className={`dash-item ${disponivel ? 'disponivel' : 'em-breve'}`}
                    onClick={() => abrir(i)}
                    disabled={!disponivel}
                  >
                    <span className="dash-item-icone">{i.icone}</span>
                    <span className="dash-item-texto">
                      <span className="dash-item-nome">{i.nome}</span>
                      <span className="dash-item-desc">{i.descricao}</span>
                    </span>
                    {disponivel ? (
                      <span className="dash-item-seta">→</span>
                    ) : (
                      <span className="dash-item-tag">Em breve</span>
                    )}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}
