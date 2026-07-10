import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import Topbar from '../../../components/Topbar'
import AbasPA from './AbasPA'
import { formatarMoeda } from '../../../utils/formato'
import { resumoPAEstoque, formatarGramatura } from '../../../utils/pa'
import '../CafeCru.css'
import './PA.css'

export default function PAEstoque() {
  const linhas = useMemo(
    () =>
      resumoPAEstoque().sort(
        (a, b) => (a.paNome || '').localeCompare(b.paNome || '') || a.gramatura - b.gramatura,
      ),
    [],
  )

  const valorGeral = useMemo(() => linhas.reduce((s, l) => s + l.valorTotal, 0), [linhas])
  const totalPacotes = useMemo(() => linhas.reduce((s, l) => s + l.quantidade, 0), [linhas])

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="kx-breadcrumb">
          <Link to="/estoque" className="ec-link">
            Estoque
          </Link>{' '}
          · Produtos acabados · Estoque
        </div>

        <AbasPA />

        <div className="kx-cabecalho">
          <h1 className="kx-titulo">Estoque de produtos acabados</h1>
        </div>

        <div className="kx-totais" style={{ marginTop: 0, marginBottom: 18 }}>
          <div className="kx-total">
            <span className="kx-total-label">Valor total em estoque</span>
            <strong className="kx-total-valor">{formatarMoeda(valorGeral)}</strong>
          </div>
          <div className="kx-total">
            <span className="kx-total-label">Pacotes em estoque</span>
            <strong className="kx-total-valor">{totalPacotes}</strong>
          </div>
          <div className="kx-total">
            <span className="kx-total-label">Itens (produto × gramatura)</span>
            <strong className="kx-total-valor">{linhas.length}</strong>
          </div>
        </div>

        <div className="kx-tabela-wrap">
          <table className="kx-tabela">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Gramatura</th>
                <th className="kx-num">Qtd. em estoque</th>
                <th className="kx-num">Custo médio</th>
                <th className="kx-num">Valor total</th>
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={5} className="kx-vazio">
                    Nenhum produto em estoque. Registre uma ordem de produção.
                  </td>
                </tr>
              )}
              {linhas.map((l) => (
                <tr key={`${l.paId}-${l.gramatura}`}>
                  <td style={{ fontWeight: 700, color: 'var(--verde)' }}>{l.paNome}</td>
                  <td>{formatarGramatura(l.gramatura)}</td>
                  <td className="kx-num">{l.quantidade} pacotes</td>
                  <td className="kx-num">{formatarMoeda(l.custoMedio)}</td>
                  <td className="kx-num">{formatarMoeda(l.valorTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
