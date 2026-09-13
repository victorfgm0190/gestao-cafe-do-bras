import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import Topbar from '../../components/Topbar'
import AbasFinanceiro from './AbasFinanceiro'
import ModalBoleto from './ModalBoleto'
import ModalVinculo from './ModalVinculo'
import { formatarData, formatarMoeda } from '../../utils/formato'
import {
  ROTULO_STATUS,
  ROTULO_STATUS_PARCELA,
  cancelarBoleto,
  classeBadge,
  dataISO,
  listarBoletos,
  obterBoleto,
} from '../../utils/boletos'
import '../estoque/CafeCru.css'
import './Boletos.css'

// CANCELADO fica de fora: cancelar grava excluido_em, e a listagem filtra
// excluido_em IS NULL — o filtro nunca devolveria nada.
const FILTROS_STATUS = [
  { valor: '', rotulo: 'Todos' },
  { valor: 'SEM_VINCULO', rotulo: 'Sem vínculo' },
  { valor: 'VINCULADO', rotulo: 'Vinculado' },
  { valor: 'PAGO', rotulo: 'Pago' },
]

const TAMANHOS_PAGINA = [10, 20, 50]

const PAGINACAO_VAZIA = { total: 0, pagina: 1, limite: 10, paginas: 1 }

// Ordenação é aplicada no cliente, sobre a página carregada: a API ordena por
// criado_em DESC e pagina no servidor, sem parâmetro de ordenação.
const COLUNAS_ORDENAVEIS = {
  id: (b) => Number(b.id),
  fornecedor: (b) => String(b.fornecedor || '').toLowerCase(),
  data_entrada: (b) => dataISO(b.data_entrada),
  valor_total: (b) => Number(b.valor_total),
  status: (b) => String(b.status),
}

export default function Boletos() {
  const [status, setStatus] = useState('')
  const [busca, setBusca] = useState('')
  const [fornecedor, setFornecedor] = useState('') // busca com debounce aplicado
  const [pagina, setPagina] = useState(1)
  const [limite, setLimite] = useState(10)
  const [recarga, setRecarga] = useState(0)

  const [boletos, setBoletos] = useState([])
  const [paginacao, setPaginacao] = useState(PAGINACAO_VAZIA)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const [ordem, setOrdem] = useState({ coluna: null, asc: true })
  const [expandido, setExpandido] = useState(null)
  const [detalhes, setDetalhes] = useState({}) // id → { carregando, erro, parcelas, observacoes }

  const [modalBoleto, setModalBoleto] = useState(null) // { boleto } — boleto null = novo
  const [modalVinculo, setModalVinculo] = useState(null)

  // Debounce da busca por fornecedor (a filtragem é do servidor).
  useEffect(() => {
    const t = setTimeout(() => {
      setFornecedor(busca.trim())
      setPagina(1)
    }, 350)
    return () => clearTimeout(t)
  }, [busca])

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    ;(async () => {
      try {
        const r = await listarBoletos({ status, fornecedor, pagina, limite })
        if (!vivo) return
        setBoletos(r.boletos || [])
        setPaginacao(r.paginacao || PAGINACAO_VAZIA)
        setErro('')
      } catch (e) {
        if (vivo) {
          setErro(e.message || 'Falha ao carregar os boletos.')
          setBoletos([])
          setPaginacao(PAGINACAO_VAZIA)
        }
      } finally {
        if (vivo) setCarregando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [status, fornecedor, pagina, limite, recarga])

  const recarregar = useCallback(() => {
    setDetalhes({})
    setExpandido(null)
    setRecarga((n) => n + 1)
  }, [])

  const ordenados = useMemo(() => {
    if (!ordem.coluna) return boletos
    const chave = COLUNAS_ORDENAVEIS[ordem.coluna]
    return [...boletos].sort((a, b) => {
      const va = chave(a)
      const vb = chave(b)
      if (va < vb) return ordem.asc ? -1 : 1
      if (va > vb) return ordem.asc ? 1 : -1
      return 0
    })
  }, [boletos, ordem])

  const totaisPagina = useMemo(() => {
    let valor = 0
    let pago = 0
    for (const b of boletos) {
      valor += Number(b.valor_total) || 0
      pago += Number(b.valor_pago) || 0
    }
    return { valor, pago }
  }, [boletos])

  function alternarOrdem(coluna) {
    setOrdem((o) => (o.coluna === coluna ? { coluna, asc: !o.asc } : { coluna, asc: true }))
  }

  function seta(coluna) {
    if (ordem.coluna !== coluna) return null
    return <span className="bo-seta">{ordem.asc ? '▲' : '▼'}</span>
  }

  // As parcelas só vêm no GET /api/boletos/:id — carregadas ao expandir a linha.
  async function alternarDetalhe(boleto) {
    if (expandido === boleto.id) {
      setExpandido(null)
      return
    }
    setExpandido(boleto.id)
    if (detalhes[boleto.id]) return
    setDetalhes((d) => ({ ...d, [boleto.id]: { carregando: true } }))
    try {
      const r = await obterBoleto(boleto.id)
      setDetalhes((d) => ({
        ...d,
        [boleto.id]: {
          carregando: false,
          parcelas: r.boleto?.parcelas || [],
          observacoes: r.boleto?.observacoes || '',
        },
      }))
    } catch (e) {
      setDetalhes((d) => ({
        ...d,
        [boleto.id]: { carregando: false, erro: e.message || 'Falha ao carregar as parcelas.' },
      }))
    }
  }

  async function cancelar(boleto) {
    const confirmado = window.confirm(
      `Cancelar o boleto #${boleto.id} (${boleto.fornecedor})?\n\n` +
        'Ele sai da listagem. Boletos com parcela paga não podem ser cancelados.',
    )
    if (!confirmado) return
    try {
      const r = await cancelarBoleto(boleto.id)
      setAviso(r.mensagem || `Boleto #${boleto.id} cancelado.`)
      setErro('')
      recarregar()
    } catch (e) {
      setErro(e.message || 'Falha ao cancelar o boleto.')
    }
  }

  function aoSalvarBoleto(mensagem) {
    setModalBoleto(null)
    setAviso(mensagem)
    setErro('')
    recarregar()
  }

  const inicio = paginacao.total === 0 ? 0 : (paginacao.pagina - 1) * paginacao.limite + 1
  const fim = Math.min(paginacao.pagina * paginacao.limite, paginacao.total)

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="kx-cabecalho">
          <div>
            <div className="kx-breadcrumb">Financeiro</div>
            <h1 className="kx-titulo">Boletos</h1>
          </div>
          <button className="btn btn-primary" onClick={() => setModalBoleto({ boleto: null })}>
            + Novo boleto
          </button>
        </div>

        <AbasFinanceiro />

        <div className="bo-filtros">
          <div className="bo-filtro">
            <span className="bo-filtro-label">Fornecedor</span>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por fornecedor..."
            />
          </div>
          <div className="bo-filtro">
            <span className="bo-filtro-label">Status</span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setPagina(1)
              }}
            >
              {FILTROS_STATUS.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="bo-filtro">
            <span className="bo-filtro-label">Por página</span>
            <select
              value={limite}
              onChange={(e) => {
                setLimite(Number(e.target.value))
                setPagina(1)
              }}
            >
              {TAMANHOS_PAGINA.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          {(status || busca) && (
            <button
              className="kx-limpar"
              onClick={() => {
                setStatus('')
                setBusca('')
                setPagina(1)
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>

        <p className="bo-nota">
          Filtros e paginação rodam no servidor. A ordenação por coluna reordena apenas a página
          carregada. Boletos cancelados saem da listagem.
        </p>

        {erro && <div className="bo-msg erro">{erro}</div>}
        {aviso && <div className="bo-msg ok">{aviso}</div>}

        <div className="kx-totais" style={{ marginTop: 0, marginBottom: 20 }}>
          <div className="kx-total">
            <span className="kx-total-label">Boletos no filtro</span>
            <strong className="kx-total-valor">{paginacao.total}</strong>
          </div>
          <div className="kx-total">
            <span className="kx-total-label">Valor nesta página</span>
            <strong className="kx-total-valor">{formatarMoeda(totaisPagina.valor)}</strong>
          </div>
          <div className="kx-total entra">
            <span className="kx-total-label">Pago nesta página</span>
            <strong className="kx-total-valor">{formatarMoeda(totaisPagina.pago)}</strong>
          </div>
        </div>

        <div className="kx-tabela-wrap">
          <table className="kx-tabela">
            <thead>
              <tr>
                <th className="bo-ordenavel" onClick={() => alternarOrdem('id')}>
                  # {seta('id')}
                </th>
                <th className="bo-ordenavel" onClick={() => alternarOrdem('fornecedor')}>
                  Fornecedor {seta('fornecedor')}
                </th>
                <th className="bo-ordenavel" onClick={() => alternarOrdem('data_entrada')}>
                  Entrada {seta('data_entrada')}
                </th>
                <th className="kx-num bo-ordenavel" onClick={() => alternarOrdem('valor_total')}>
                  Valor {seta('valor_total')}
                </th>
                <th className="kx-num">Parcelas</th>
                <th className="bo-ordenavel" onClick={() => alternarOrdem('status')}>
                  Status {seta('status')}
                </th>
                <th className="kx-num">Ações</th>
              </tr>
            </thead>
            <tbody>
              {carregando && (
                <tr>
                  <td colSpan={7} className="kx-vazio">
                    Carregando boletos...
                  </td>
                </tr>
              )}

              {!carregando && ordenados.length === 0 && (
                <tr>
                  <td colSpan={7} className="kx-vazio">
                    {status || fornecedor
                      ? 'Nenhum boleto para esse filtro.'
                      : 'Nenhum boleto cadastrado ainda.'}
                  </td>
                </tr>
              )}

              {!carregando &&
                ordenados.map((b) => {
                  const detalhe = detalhes[b.id]
                  const aberto = expandido === b.id
                  return (
                    <Fragment key={b.id}>
                      <tr>
                        <td>{b.id}</td>
                        <td className="kx-desc">{b.fornecedor}</td>
                        <td>{formatarData(dataISO(b.data_entrada))}</td>
                        <td className="kx-num">{formatarMoeda(b.valor_total)}</td>
                        <td className="kx-num">
                          {Number(b.parcelas_pagas)}/{Number(b.parcelas_total)}
                        </td>
                        <td>
                          <span className={classeBadge(b.status)}>
                            {ROTULO_STATUS[b.status] || b.status}
                          </span>
                        </td>
                        <td className="kx-num">
                          <div className="bo-acoes">
                            <button className="kx-limpar" onClick={() => alternarDetalhe(b)}>
                              {aberto ? 'Fechar' : 'Parcelas'}
                            </button>
                            <button
                              className="kx-limpar"
                              onClick={() => setModalBoleto({ boleto: b })}
                            >
                              Editar
                            </button>
                            {b.status === 'SEM_VINCULO' && (
                              <button className="kx-limpar" onClick={() => setModalVinculo(b)}>
                                Vincular
                              </button>
                            )}
                            <button
                              className="kx-limpar perigo"
                              onClick={() => cancelar(b)}
                              disabled={Number(b.parcelas_pagas) > 0}
                              title={
                                Number(b.parcelas_pagas) > 0
                                  ? 'Boleto com parcela paga não pode ser cancelado.'
                                  : undefined
                              }
                            >
                              Cancelar
                            </button>
                          </div>
                        </td>
                      </tr>

                      {aberto && (
                        <tr>
                          <td colSpan={7} className="bo-detalhe-celula">
                            <div className="bo-detalhe">
                              <div className="bo-detalhe-titulo">Parcelas</div>
                              {detalhe?.carregando && <p className="campo-ajuda">Carregando...</p>}
                              {detalhe?.erro && <div className="bo-msg erro">{detalhe.erro}</div>}
                              {detalhe?.parcelas && (
                                <table className="bo-parcelas">
                                  <thead>
                                    <tr>
                                      <th>Parcela</th>
                                      <th>Vencimento</th>
                                      <th className="num">Valor</th>
                                      <th>Status</th>
                                      <th>Pagamento</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detalhe.parcelas.map((p) => (
                                      <tr key={p.id}>
                                        <td>
                                          {p.numero_parcela}/{detalhe.parcelas.length}
                                        </td>
                                        <td>{formatarData(p.data_vencimento)}</td>
                                        <td className="num">{formatarMoeda(p.valor)}</td>
                                        <td>
                                          <span className={classeBadge(p.status)}>
                                            {ROTULO_STATUS_PARCELA[p.status] || p.status}
                                          </span>
                                        </td>
                                        <td>
                                          {p.data_pagamento ? formatarData(p.data_pagamento) : '—'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                              {detalhe?.observacoes && (
                                <p className="bo-obs">
                                  <strong>Observações:</strong> {detalhe.observacoes}
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
            </tbody>
          </table>
        </div>

        <div className="bo-paginacao">
          <span className="bo-paginacao-info">
            {paginacao.total === 0
              ? 'Nenhum registro'
              : `Mostrando ${inicio}–${fim} de ${paginacao.total}`}
          </span>
          <div className="bo-paginacao-botoes">
            <button
              className="kx-limpar"
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={paginacao.pagina <= 1 || carregando}
            >
              ← Anterior
            </button>
            <span className="bo-paginacao-info">
              Página {paginacao.pagina} de {paginacao.paginas}
            </span>
            <button
              className="kx-limpar"
              onClick={() => setPagina((p) => Math.min(paginacao.paginas, p + 1))}
              disabled={paginacao.pagina >= paginacao.paginas || carregando}
            >
              Próxima →
            </button>
          </div>
        </div>
      </main>

      {modalBoleto && (
        <ModalBoleto
          boleto={modalBoleto.boleto}
          aoFechar={() => setModalBoleto(null)}
          aoSalvar={aoSalvarBoleto}
        />
      )}

      {modalVinculo && (
        <ModalVinculo
          boleto={modalVinculo}
          aoFechar={() => setModalVinculo(null)}
          aoVincular={() => {
            setModalVinculo(null)
            setAviso(`Boleto #${modalVinculo.id} vinculado. Veja o impacto na aba Vínculos.`)
            recarregar()
          }}
        />
      )}
    </div>
  )
}
