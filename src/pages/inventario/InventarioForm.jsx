import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Topbar from '../../components/Topbar'
import { registrarLog, ACOES } from '../../utils/auditoria'
import { nomeUsuarioAtual } from '../../utils/permissoes'
import {
  novoInventario,
  carregarInventario,
  salvarInventario,
  aplicarContagem,
  resumoInventario,
  regularizarItem,
  concluirInventario,
  CATEGORIAS,
} from '../../utils/inventario'
import '../estoque/CafeCru.css'
import './Inventario.css'

function fmtNum(n) {
  return (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

export default function InventarioForm() {
  const navigate = useNavigate()
  const location = useLocation()
  const st = location.state || {}

  const [inv, setInv] = useState(null)
  const [etapa, setEtapa] = useState(1)
  const [regQtd, setRegQtd] = useState({})

  useEffect(() => {
    let vivo = true
    ;(async () => {
      let inicial = null
      if (st.continuarId) {
        inicial = await carregarInventario(st.continuarId)
      }
      if (!inicial) {
        inicial = await novoInventario(st.tipo || 'Diário', nomeUsuarioAtual())
      }
      if (vivo) setInv(inicial)
    })()
    return () => {
      vivo = false
    }
  }, [])

  const resumo = useMemo(() => resumoInventario(inv || { itens: [] }), [inv])

  if (!inv) return null

  function setFisico(idx, valor) {
    setInv((prev) => {
      const itens = prev.itens.slice()
      itens[idx] = aplicarContagem(itens[idx], valor)
      return { ...prev, itens }
    })
  }

  async function persistir(status) {
    const atualizado = await salvarInventario({ ...inv, status: status || inv.status })
    setInv(atualizado)
    return atualizado
  }

  async function salvarRascunho() {
    await persistir('Rascunho')
    registrarLog(nomeUsuarioAtual(), 'Inventário', ACOES.INCLUIU, `Salvou rascunho de inventário (${inv.tipo})`)
    navigate('/inventario')
  }

  async function verResultado() {
    await persistir('Rascunho') // garante id persistido para regularizar
    setEtapa(2)
  }

  async function regularizar(idx, opcoes) {
    const atualizado = await regularizarItem(inv.id, idx, opcoes, inv.itens)
    if (atualizado) setInv({ ...atualizado })
  }

  async function concluir() {
    const { inventario, concluido } = await concluirInventario(inv.id, inv.itens)
    if (concluido) {
      if (inventario) setInv(inventario)
      registrarLog(
        nomeUsuarioAtual(),
        'Inventário',
        ACOES.INVENTARIO,
        `Concluiu inventário ${inv.data} (${inv.tipo}) — ${resumo.comDiferenca} diferenças regularizadas`,
      )
      navigate(`/inventario/${inv.id}`)
    }
  }

  // ---- Renderização de uma seção da contagem ----
  function Secao({ titulo, icone, categoria, colProdutor, colUnidade }) {
    const linhas = inv.itens.map((it, idx) => ({ it, idx })).filter((x) => x.it.categoria === categoria)
    if (linhas.length === 0) return null
    return (
      <div className="inv-secao">
        <div className="inv-secao-tit">
          {icone} {titulo}
        </div>
        <div className="kx-tabela-wrap">
          <table className="kx-tabela">
            <thead>
              <tr>
                <th>{categoria === CATEGORIAS.CRU ? 'Lote' : 'Item'}</th>
                {colProdutor && <th>Produtor / variedade</th>}
                {colUnidade && <th>Unidade</th>}
                <th className="kx-num">Saldo sistema</th>
                <th className="kx-num">Contagem física</th>
                <th className="kx-num">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ it, idx }) => (
                <tr key={idx}>
                  <td style={{ fontWeight: 600 }}>{it.referencia}</td>
                  {colProdutor && <td>{it.descricao}</td>}
                  {colUnidade && <td>{it.unidade}</td>}
                  <td className="kx-num">
                    {fmtNum(it.saldoSistema)} {it.unidade}
                  </td>
                  <td className="kx-num">
                    <input
                      className="inv-input"
                      type="number"
                      step="0.01"
                      min="0"
                      value={it.saldoFisico == null ? '' : it.saldoFisico}
                      onChange={(e) => setFisico(idx, e.target.value)}
                      placeholder="—"
                    />
                  </td>
                  <td
                    className={`kx-num inv-dif ${
                      it.diferenca > 1e-9 ? 'pos' : it.diferenca < -1e-9 ? 'neg' : 'zero'
                    }`}
                  >
                    {it.diferenca > 0 ? '+' : ''}
                    {fmtNum(it.diferenca)} {it.unidade}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // ---- Card de regularização (etapa 2) ----
  function CardRegularizacao({ it, idx }) {
    const sobra = it.diferenca > 0
    const qtd = Math.abs(it.diferenca)
    const unidade = it.unidade

    if (it.regularizado) {
      return (
        <div className="inv-reg-card feito">
          <div className="inv-reg-info">
            <div className="inv-reg-titulo">{it.descricao}</div>
            <div className="inv-reg-desc">
              ✓ Regularizado — {it.regularizacao?.descricao} ({fmtNum(it.regularizacao?.quantidade)} {unidade})
            </div>
          </div>
          <span className="inv-reg-feito">Regularizado</span>
        </div>
      )
    }

    // Falta em produto embalado → saída não identificada (com quantidade)
    if (!sobra && it.categoria === CATEGORIAS.EMBALADO) {
      const valor = regQtd[idx] ?? qtd
      return (
        <div className="inv-reg-card falta">
          <div className="inv-reg-info">
            <div className="inv-reg-titulo">
              Faltam {fmtNum(qtd)} {unidade} de {it.descricao}
            </div>
            <div className="inv-reg-desc">O que aconteceu com esses produtos?</div>
          </div>
          <div className="inv-reg-form">
            <select disabled value="saida">
              <option value="saida">Saída não identificada</option>
            </select>
            <input
              type="number"
              min="0"
              step="1"
              value={valor}
              onChange={(e) => setRegQtd((m) => ({ ...m, [idx]: e.target.value }))}
              style={{ width: 90 }}
            />
            <button
              className="btn btn-primary"
              onClick={() => regularizar(idx, { quantidade: valor })}
            >
              Regularizar
            </button>
          </div>
        </div>
      )
    }

    // Falta em cru/torrado/insumo → perda
    if (!sobra) {
      return (
        <div className="inv-reg-card falta">
          <div className="inv-reg-info">
            <div className="inv-reg-titulo">
              Falta {fmtNum(qtd)} {unidade} de {it.descricao}
            </div>
            <div className="inv-reg-desc">Gera ajuste negativo no kardex correspondente.</div>
          </div>
          <button className="btn btn-danger" onClick={() => regularizar(idx, {})}>
            Registrar como perda
          </button>
        </div>
      )
    }

    // Sobra (qualquer categoria) → ajuste positivo
    return (
      <div className="inv-reg-card sobra">
        <div className="inv-reg-info">
          <div className="inv-reg-titulo">
            Sobram {fmtNum(qtd)} {unidade} de {it.descricao}
          </div>
          <div className="inv-reg-desc">Gera entrada/ajuste positivo no kardex correspondente.</div>
        </div>
        <button className="btn btn-primary" onClick={() => regularizar(idx, {})}>
          Registrar como ajuste positivo
        </button>
      </div>
    )
  }

  const itensComDiferenca = inv.itens.map((it, idx) => ({ it, idx })).filter((x) => x.it.status !== 'ok')

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="kx-breadcrumb">Inventário · {inv.tipo} · {etapa === 1 ? 'Contagem' : 'Resultado'}</div>
        <div className="kx-cabecalho">
          <h1 className="kx-titulo">
            {etapa === 1 ? 'Contagem física' : 'Resultado e regularização'}
          </h1>
        </div>

        {etapa === 1 && (
          <>
            {inv.itens.length === 0 && (
              <div className="kx-tabela-wrap">
                <div className="kx-vazio" style={{ padding: 40 }}>
                  Nenhum item com saldo no sistema para inventariar.
                </div>
              </div>
            )}
            <Secao titulo="Café cru (por lote)" icone="🌱" categoria={CATEGORIAS.CRU} colProdutor />
            <Secao titulo="Café torrado a granel" icone="🔥" categoria={CATEGORIAS.TORRADO} />
            <Secao titulo="Produtos embalados" icone="☕" categoria={CATEGORIAS.EMBALADO} />
            <Secao titulo="Insumos" icone="🧰" categoria={CATEGORIAS.INSUMO} colUnidade />

            <div className="inv-acoes-rodape">
              <button className="btn btn-ghost" onClick={salvarRascunho}>
                Salvar rascunho
              </button>
              <button className="btn btn-primary" onClick={verResultado} disabled={inv.itens.length === 0}>
                Ver resultado →
              </button>
            </div>
          </>
        )}

        {etapa === 2 && (
          <>
            <div className="inv-resumo">
              <div className="inv-resumo-card ok">
                <span className="inv-resumo-valor">✅ {resumo.ok}</span>
                <span className="inv-resumo-label">itens OK</span>
              </div>
              <div className="inv-resumo-card dif">
                <span className="inv-resumo-valor">⚠️ {resumo.comDiferenca}</span>
                <span className="inv-resumo-label">itens com diferença</span>
                <span className="inv-resumo-sub">
                  {resumo.sobras} sobras · {resumo.faltas} faltas
                </span>
              </div>
            </div>

            {itensComDiferenca.length === 0 ? (
              <div className="kx-tabela-wrap">
                <div className="kx-vazio" style={{ padding: 30 }}>
                  Nenhuma diferença encontrada — estoque bate com o sistema. 🎉
                </div>
              </div>
            ) : (
              itensComDiferenca.map(({ it, idx }) => <CardRegularizacao key={idx} it={it} idx={idx} />)
            )}

            <div className="inv-acoes-rodape">
              <button className="btn btn-ghost" onClick={() => setEtapa(1)}>
                ← Voltar à contagem
              </button>
              <button className="btn btn-primary" onClick={concluir} disabled={!resumo.tudoRegularizado}>
                Concluir inventário
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
