import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { estaLogado } from '../utils/auth'
import { itensAbaixo } from '../utils/estoqueMinimo'
import './AlertaEstoque.css'

const CHAVE_SESSAO = 'alerta_estoque_visto'

function fmt(n) {
  return (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

// Popup global: ao carregar o app (logado), verifica itens abaixo do mínimo.
// Aparece no máximo 1x por sessão.
export default function AlertaEstoque() {
  const location = useLocation()
  const navigate = useNavigate()
  const [itens, setItens] = useState([])
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem(CHAVE_SESSAO)) return
    if (!estaLogado()) return
    let abaixo = []
    try {
      abaixo = itensAbaixo()
    } catch {
      abaixo = []
    }
    if (abaixo.length > 0) {
      setItens(abaixo)
      setAberto(true)
      sessionStorage.setItem(CHAVE_SESSAO, '1')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  if (!aberto) return null

  function fechar() {
    setAberto(false)
  }
  function verEstoque() {
    setAberto(false)
    navigate('/estoque')
  }

  return (
    <div className="ae-overlay" onMouseDown={fechar}>
      <div className="ae-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ae-topo">
          <span className="ae-icone">⚠️</span>
          <h2>Alertas de estoque mínimo</h2>
        </div>
        <p className="ae-sub">
          {itens.length} {itens.length === 1 ? 'item está' : 'itens estão'} abaixo do estoque mínimo:
        </p>
        <ul className="ae-lista">
          {itens.map((it) => (
            <li key={it.chave}>
              <span className="ae-nome">⚠️ {it.nome}</span>
              <span className="ae-num">
                {fmt(it.saldoAtual)} {it.unidade}
                <span className="ae-min">
                  {' '}
                  (mínimo: {fmt(it.minimo)} {it.unidade})
                </span>
              </span>
            </li>
          ))}
        </ul>
        <div className="ae-acoes">
          <button className="btn btn-ghost" onClick={fechar}>
            Fechar
          </button>
          <button className="btn btn-primary" onClick={verEstoque}>
            Ver Estoque
          </button>
        </div>
      </div>
    </div>
  )
}
