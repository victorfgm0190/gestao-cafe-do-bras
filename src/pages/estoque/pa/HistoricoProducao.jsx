import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Topbar from '../../../components/Topbar'
import AbasPA from './AbasPA'
import { formatarMoeda, formatarData, formatarKg } from '../../../utils/formato'
import { registrarLog, ACOES } from '../../../utils/auditoria'
import { nomeUsuarioAtual } from '../../../utils/permissoes'
import { carregarOrdens, estornarOrdem, formatarGramatura } from '../../../utils/pa'
import '../CafeCru.css'
import './PA.css'

export default function HistoricoProducao() {
  const [ordens, setOrdens] = useState(carregarOrdens)

  const ordenadas = useMemo(
    () => [...ordens].sort((a, b) => (b.data || '').localeCompare(a.data || '') || b.id - a.id),
    [ordens],
  )

  function excluir(ordem) {
    if (
      window.confirm(
        'Tem certeza? Esta ação vai estornar a produção: devolve o café cru aos lotes, remove a sobra torrada, devolve as embalagens e apaga o PA produzido.',
      )
    ) {
      estornarOrdem(ordem.id)
      registrarLog(
        nomeUsuarioAtual(),
        'Estoque PA',
        ACOES.EXCLUIU,
        `Estornou a produção ${formatarData(ordem.data)} — ${ordem.paNome} ${formatarGramatura(ordem.gramatura)} × ${ordem.quantidade}`,
      )
      setOrdens(carregarOrdens())
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
                <th>Data</th>
                <th>Produto</th>
                <th>Gramatura</th>
                <th className="kx-num">Pacotes</th>
                <th className="kx-num">Cru usado</th>
                <th className="kx-num">Custo/pacote</th>
                <th className="kx-num">Custo total</th>
                <th className="kx-num">Ações</th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.length === 0 && (
                <tr>
                  <td colSpan={8} className="kx-vazio">
                    Nenhuma ordem de produção registrada ainda.
                  </td>
                </tr>
              )}
              {ordenadas.map((o) => (
                <tr key={o.id}>
                  <td>{formatarData(o.data)}</td>
                  <td style={{ fontWeight: 700, color: 'var(--verde)' }}>{o.paNome}</td>
                  <td>{formatarGramatura(o.gramatura)}</td>
                  <td className="kx-num">{o.quantidade}</td>
                  <td className="kx-num">{formatarKg(o.totalCru)}</td>
                  <td className="kx-num">{formatarMoeda(o.custoUnitario)}</td>
                  <td className="kx-num">{formatarMoeda(o.custoTotal)}</td>
                  <td className="kx-num">
                    <button className="kx-limpar" onClick={() => excluir(o)}>
                      🗑 Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
