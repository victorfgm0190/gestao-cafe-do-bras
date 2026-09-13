import { useEffect, useMemo, useState } from 'react'
import Topbar from '../../components/Topbar'
import AbasFinanceiro from './AbasFinanceiro'
import { formatarMoeda } from '../../utils/formato'
import { classeBadge } from '../../utils/boletos'
import {
  ROTULO_TABELA,
  descreverImpacto,
  formatarCustoKg,
  desfazerVinculo,
  listarVinculos,
  obterVinculo,
} from '../../utils/vinculos'
import '../estoque/CafeCru.css'
import './Boletos.css'

// criado_em/atualizado_em são timestamps; formatarData() do projeto só trata
// 'AAAA-MM-DD'.
function dataHora(valor) {
  if (!valor) return '—'
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return String(valor)
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function mesCorrente(valor) {
  if (!valor) return false
  const d = new Date(valor)
  const hoje = new Date()
  return d.getFullYear() === hoje.getFullYear() && d.getMonth() === hoje.getMonth()
}

export default function Vinculos() {
  const [vinculos, setVinculos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [recarga, setRecarga] = useState(0)

  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('')

  const [selecionado, setSelecionado] = useState(null) // { vinculo, impactos } | { carregando }
  const [desfazendo, setDesfazendo] = useState(false)

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    ;(async () => {
      try {
        const r = await listarVinculos()
        if (!vivo) return
        setVinculos(r.vinculos || [])
        setErro('')
      } catch (e) {
        if (vivo) setErro(e.message || 'Falha ao carregar os vínculos.')
      } finally {
        if (vivo) setCarregando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [recarga])

  // A rota devolve a lista inteira (sem paginação), então filtrar no cliente
  // não esconde nada do usuário.
  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return vinculos.filter((v) => {
      const casaStatus = !status || v.status === status
      const casaTermo =
        !termo ||
        String(v.fornecedor || '').toLowerCase().includes(termo) ||
        String(v.codigo_lote || '').toLowerCase().includes(termo) ||
        String(v.fazenda || '').toLowerCase().includes(termo) ||
        String(v.variedade || '').toLowerCase().includes(termo) ||
        String(v.boleto_id) === termo
      return casaStatus && casaTermo
    })
  }, [vinculos, busca, status])

  const resumo = useMemo(
    () => ({
      total: vinculos.length,
      ativos: vinculos.filter((v) => v.status === 'ATIVO').length,
      cancelados: vinculos.filter((v) => v.status === 'CANCELADO').length,
      mes: vinculos.filter((v) => mesCorrente(v.criado_em)).length,
    }),
    [vinculos],
  )

  async function abrir(vinculo) {
    setSelecionado({ carregando: true, vinculo })
    try {
      const r = await obterVinculo(vinculo.id)
      setSelecionado({ vinculo: { ...vinculo, ...r.vinculo }, impactos: r.impactos || [] })
    } catch (e) {
      setSelecionado({ vinculo, erro: e.message || 'Falha ao carregar o impacto.' })
    }
  }

  async function desfazer(vinculo) {
    const confirmado = window.confirm(
      `Desfazer o vínculo #${vinculo.id}?\n\n` +
        'Cada registro tocado pela cascata volta ao valor anterior (lote, kardex, estoque de PA) ' +
        'e o boleto volta para SEM_VINCULO.',
    )
    if (!confirmado) return
    setDesfazendo(true)
    try {
      const r = await desfazerVinculo(vinculo.id)
      setAviso(r.mensagem || `Vínculo #${vinculo.id} desfeito.`)
      setErro('')
      setSelecionado(null)
      setRecarga((n) => n + 1)
    } catch (e) {
      setErro(e.message || 'Falha ao desfazer o vínculo.')
    } finally {
      setDesfazendo(false)
    }
  }

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="kx-cabecalho">
          <div>
            <div className="kx-breadcrumb">Financeiro</div>
            <h1 className="kx-titulo">Vínculos</h1>
          </div>
        </div>

        <AbasFinanceiro />

        <div className="bo-filtros">
          <div className="bo-filtro">
            <span className="bo-filtro-label">Buscar</span>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Fornecedor, lote, fazenda..."
            />
          </div>
          <div className="bo-filtro">
            <span className="bo-filtro-label">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="ATIVO">Ativo</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
          </div>
          {(busca || status) && (
            <button
              className="kx-limpar"
              onClick={() => {
                setBusca('')
                setStatus('')
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>

        <p className="bo-nota">
          Um vínculo grava o valor do boleto como custo do lote e propaga em cascata: kardex, média
          do grupo fazenda+variedade e custo do estoque de PA. Clique no card para ver o antes e
          depois de cada registro.
        </p>

        {erro && <div className="bo-msg erro">{erro}</div>}
        {aviso && <div className="bo-msg ok">{aviso}</div>}

        <div className="kx-totais" style={{ marginTop: 0 }}>
          <div className="kx-total">
            <span className="kx-total-label">Total de vínculos</span>
            <strong className="kx-total-valor">{resumo.total}</strong>
          </div>
          <div className="kx-total entra">
            <span className="kx-total-label">Ativos</span>
            <strong className="kx-total-valor">{resumo.ativos}</strong>
          </div>
          <div className="kx-total sai">
            <span className="kx-total-label">Desfeitos</span>
            <strong className="kx-total-valor">{resumo.cancelados}</strong>
          </div>
          <div className="kx-total">
            <span className="kx-total-label">Neste mês</span>
            <strong className="kx-total-valor">{resumo.mes}</strong>
          </div>
        </div>

        {carregando && <p className="campo-ajuda" style={{ marginTop: 20 }}>Carregando vínculos...</p>}

        {!carregando && filtrados.length === 0 && (
          <div className="kx-tabela-wrap">
            <table className="kx-tabela">
              <tbody>
                <tr>
                  <td className="kx-vazio">
                    {vinculos.length === 0
                      ? 'Nenhum vínculo criado ainda. Crie um pela aba Boletos.'
                      : 'Nenhum vínculo para esse filtro.'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="bo-cards">
          {filtrados.map((v) => (
            // Card clicável como div (e não button) porque o conteúdo tem
            // divs, que não são conteúdo válido dentro de <button>.
            <div
              key={v.id}
              className={`bo-card ${v.status === 'CANCELADO' ? 'cancelado' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => abrir(v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  abrir(v)
                }
              }}
            >
              <div className="bo-card-topo">
                <span className="bo-card-id">VÍNCULO #{v.id}</span>
                <span className={classeBadge(v.status === 'ATIVO' ? 'ATIVO' : 'CANCELADO')}>
                  {v.status === 'ATIVO' ? 'Ativo' : 'Desfeito'}
                </span>
              </div>
              <div className="bo-card-titulo">{v.fornecedor}</div>
              <div className="bo-card-linha">
                <span>Boleto #{v.boleto_id}</span>
                <strong>{formatarMoeda(v.valor_total)}</strong>
              </div>
              <div className="bo-card-linha">
                <span>
                  {v.codigo_lote} · {v.fazenda} / {v.variedade}
                </span>
              </div>
              <div className="bo-card-linha">
                <span>Custo aplicado</span>
                <strong>{formatarCustoKg(v.custo_calculado)}/kg</strong>
              </div>
              <div className="bo-card-linha">
                <span>{dataHora(v.criado_em)}</span>
                <span>{Number(v.impactos)} registro(s) tocado(s)</span>
              </div>
            </div>
          ))}
        </div>
      </main>

      {selecionado && (
        <ModalDetalhe
          dados={selecionado}
          desfazendo={desfazendo}
          aoFechar={() => setSelecionado(null)}
          aoDesfazer={desfazer}
        />
      )}
    </div>
  )
}

function ModalDetalhe({ dados, desfazendo, aoFechar, aoDesfazer }) {
  const { vinculo, impactos, erro } = dados
  const ativo = vinculo.status === 'ATIVO'

  const porTabela = useMemo(() => {
    const mapa = {}
    for (const i of impactos || []) {
      mapa[i.tabela_afetada] = (mapa[i.tabela_afetada] || 0) + 1
    }
    return mapa
  }, [impactos])

  return (
    <div className="kx-overlay" onMouseDown={aoFechar}>
      <div className="kx-modal bo-modal-largo" onMouseDown={(e) => e.stopPropagation()}>
        <div className="kx-modal-topo">
          <h2>Vínculo #{vinculo.id}</h2>
          <button className="kx-fechar" onClick={aoFechar} aria-label="Fechar">
            ✕
          </button>
        </div>

        <div className="kx-form">
          <div className="bo-previa">
            Boleto <strong>#{vinculo.boleto_id}</strong>
            {vinculo.fornecedor ? (
              <>
                {' '}
                — <strong>{vinculo.fornecedor}</strong>
              </>
            ) : null}
            <br />
            Lote <strong>{vinculo.codigo_lote}</strong> ({vinculo.fazenda} / {vinculo.variedade})
            <br />
            Custo aplicado: <strong>{formatarCustoKg(vinculo.custo_calculado)}/kg</strong>
          </div>

          <div>
            <div className="bo-detalhe-titulo">Linha do tempo</div>
            <ul className="bo-timeline">
              <li>
                Vínculo criado e cascata aplicada
                <span className="bo-timeline-quando">{dataHora(vinculo.criado_em)}</span>
              </li>
              {!ativo && (
                <li className="desfeito">
                  Vínculo desfeito — registros devolvidos ao valor anterior
                  <span className="bo-timeline-quando">{dataHora(vinculo.atualizado_em)}</span>
                </li>
              )}
            </ul>
          </div>

          {dados.carregando && <p className="campo-ajuda">Carregando o impacto...</p>}
          {erro && <div className="bo-msg erro">{erro}</div>}

          {impactos && (
            <div>
              <div className="bo-detalhe-titulo">
                Impacto — {impactos.length} registro(s)
                {Object.keys(porTabela).length > 0 && (
                  <>
                    {' '}
                    (
                    {Object.entries(porTabela)
                      .map(([t, n]) => `${ROTULO_TABELA[t] || t}: ${n}`)
                      .join(' · ')}
                    )
                  </>
                )}
              </div>
              <table className="bo-parcelas">
                <thead>
                  <tr>
                    <th>Tabela</th>
                    <th className="num">Registro</th>
                    <th className="num">Antes</th>
                    <th className="num">Depois</th>
                  </tr>
                </thead>
                <tbody>
                  {impactos.map((i) => {
                    const d = descreverImpacto(i)
                    return (
                      <tr key={i.id}>
                        <td>{ROTULO_TABELA[i.tabela_afetada] || i.tabela_afetada}</td>
                        <td className="num">#{i.registro_id_afetado}</td>
                        <td className="num">{d.moeda ? formatarCustoKg(d.antes) : d.antes}</td>
                        <td className="num">{d.moeda ? formatarCustoKg(d.depois) : d.depois}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="campo-ajuda" style={{ marginTop: 10 }}>
                Valores por kg, exceto o registro de boleto, que guarda a mudança de status. É esta
                tabela que permite desfazer: cada linha volta ao valor da coluna “Antes”.
              </p>
            </div>
          )}

          <div className="kx-form-acoes">
            <button className="btn btn-ghost" onClick={aoFechar}>
              Fechar
            </button>
            {ativo && (
              <button
                className="btn btn-danger"
                onClick={() => aoDesfazer(vinculo)}
                disabled={desfazendo || dados.carregando}
              >
                {desfazendo ? 'Desfazendo...' : 'Desfazer vínculo'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
