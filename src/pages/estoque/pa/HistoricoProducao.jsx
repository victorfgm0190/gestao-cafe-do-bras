import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Topbar from '../../../components/Topbar'
import AbasPA from './AbasPA'
import { formatarMoeda, formatarData, formatarKg } from '../../../utils/formato'
import { registrarLog, ACOES } from '../../../utils/auditoria'
import { nomeUsuarioAtual } from '../../../utils/permissoes'
import { carregarOrdens, estornarOrdem, formatarGramatura } from '../../../utils/pa'
import '../CafeCru.css'
import './PA.css'

// Normaliza itens (compatível com ordens antigas de gramatura única).
function itensDe(o) {
  if (Array.isArray(o.itens) && o.itens.length) return o.itens
  return [
    {
      gramatura: o.gramatura,
      quantidade: o.quantidade,
      custoUnitarioCafe: o.custoUnitario ?? null,
      custoUnitarioEmbalagem: null,
      custoUnitarioTotal: o.custoUnitario ?? null,
      custoTotalGramatura: o.custoTotal ?? null,
    },
  ]
}

export default function HistoricoProducao() {
  const [ordens, setOrdens] = useState([])
  const [expandido, setExpandido] = useState(null)

  async function recarregar() {
    setOrdens(await carregarOrdens())
  }

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const dados = await carregarOrdens()
      if (vivo) setOrdens(dados)
    })()
    return () => {
      vivo = false
    }
  }, [])

  const ordenadas = useMemo(
    () => [...ordens].sort((a, b) => (b.data || '').localeCompare(a.data || '') || b.id - a.id),
    [ordens],
  )

  async function excluir(ordem) {
    if (
      window.confirm(
        'Tem certeza? Esta ação vai estornar a produção: devolve o café cru aos lotes, remove a sobra torrada, devolve as embalagens e apaga o PA produzido.',
      )
    ) {
      await estornarOrdem(ordem.id)
      registrarLog(
        nomeUsuarioAtual(),
        'Estoque PA',
        ACOES.EXCLUIU,
        `Estornou a produção ${formatarData(ordem.data)} — ${ordem.paNome}`,
      )
      await recarregar()
    }
  }

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="kx-breadcrumb">
          <Link to="/estoque" className="ec-link">
            Estoque
          </Link>{' '}
          · Produtos acabados · Histórico
        </div>

        <AbasPA />

        <div className="kx-cabecalho">
          <h1 className="kx-titulo">Histórico de produção</h1>
        </div>

        <div className="kx-tabela-wrap">
          <table className="kx-tabela">
            <thead>
              <tr>
                <th></th>
                <th>Data</th>
                <th>Produto</th>
                <th className="kx-num">Pacotes</th>
                <th className="kx-num">Cru usado</th>
                <th className="kx-num">Custo total</th>
                <th className="kx-num">Ações</th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.length === 0 && (
                <tr>
                  <td colSpan={7} className="kx-vazio">
                    Nenhuma ordem de produção registrada ainda.
                  </td>
                </tr>
              )}
              {ordenadas.map((o) => {
                const itens = itensDe(o)
                const totalPacotes = itens.reduce((s, it) => s + (Number(it.quantidade) || 0), 0)
                const aberto = expandido === o.id
                return (
                  <Fragment key={o.id}>
                    <tr>
                      <td>
                        <button
                          className="kx-limpar"
                          onClick={() => setExpandido(aberto ? null : o.id)}
                          title={aberto ? 'Recolher' : 'Expandir'}
                        >
                          {aberto ? '▾' : '▸'}
                        </button>
                      </td>
                      <td>{formatarData(o.data)}</td>
                      <td style={{ fontWeight: 700, color: 'var(--verde)' }}>
                        {o.paNome}{' '}
                        <span className="cp-muted">
                          ({itens.map((it) => `${it.quantidade}×${formatarGramatura(it.gramatura)}`).join(', ')})
                        </span>
                      </td>
                      <td className="kx-num">{totalPacotes}</td>
                      <td className="kx-num">{formatarKg(o.totalCru)}</td>
                      <td className="kx-num">{formatarMoeda(o.custoTotal)}</td>
                      <td className="kx-num">
                        <button className="kx-limpar" onClick={() => excluir(o)}>
                          🗑 Excluir
                        </button>
                      </td>
                    </tr>
                    {aberto && (
                      <tr>
                        <td colSpan={7} style={{ background: 'var(--creme)' }}>
                          <div style={{ padding: '6px 4px' }}>
                            {o.custoKgEmbalado != null && (
                              <p className="kx-filtro-label" style={{ marginBottom: 10 }}>
                                Custo total café (MP): {formatarMoeda(o.custoTotalCru)} · Custo/kg embalado:{' '}
                                {formatarMoeda(o.custoKgEmbalado)}
                              </p>
                            )}
                            <div className="pa-gram-detalhes" style={{ margin: 0 }}>
                              {itens.map((it) => (
                                <div className="pa-gram-box" key={it.gramatura}>
                                  <div className="pa-gram-box-titulo">
                                    Pacotes {formatarGramatura(it.gramatura)} ({it.quantidade} un)
                                  </div>
                                  {it.custoUnitarioCafe != null && (
                                    <div className="pa-gram-linha">
                                      <span>Café</span>
                                      <span>
                                        {formatarMoeda(it.custoUnitarioCafe)}/un →{' '}
                                        {formatarMoeda((it.custoUnitarioCafe || 0) * it.quantidade)}
                                      </span>
                                    </div>
                                  )}
                                  {it.custoUnitarioEmbalagem != null && (
                                    <div className="pa-gram-linha">
                                      <span>Embalagem</span>
                                      <span>
                                        {formatarMoeda(it.custoUnitarioEmbalagem)}/un →{' '}
                                        {formatarMoeda((it.custoUnitarioEmbalagem || 0) * it.quantidade)}
                                      </span>
                                    </div>
                                  )}
                                  <div className="pa-gram-linha total">
                                    <span>TOTAL</span>
                                    <span>
                                      {formatarMoeda(it.custoUnitarioTotal)}/un →{' '}
                                      {formatarMoeda(it.custoTotalGramatura)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <p className="kx-filtro-label" style={{ marginTop: 12 }}>
                              Sobra: {formatarKg(o.sobra)} → {formatarMoeda(0)} (custo zero) · Perda:{' '}
                              {formatarKg(o.perda)}
                            </p>
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
      </main>
    </div>
  )
}
