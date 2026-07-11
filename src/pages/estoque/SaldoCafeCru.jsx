import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import Topbar from '../../components/Topbar'
import AbasCafeCru from './AbasCafeCru'
import { formatarMoeda, formatarKg } from '../../utils/formato'
import {
  carregarEstoqueResumo,
  carregarEstoqueResumoPorGrupo,
  garantirKardexInicial,
} from '../../utils/kardex'
import './CafeCru.css'

// Garante o resumo na primeira visita (semeia do estoque de lotes).
garantirKardexInicial()

export default function SaldoCafeCru() {
  const total = useMemo(() => carregarEstoqueResumo(), [])
  const grupos = useMemo(() => carregarEstoqueResumoPorGrupo(), [])

  const saldo = Number(total.saldoAtual) || 0
  const custoMedio = Number(total.custoMedio) || 0
  const valorTotal = saldo * custoMedio

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="kx-breadcrumb">
          <Link to="/estoque" className="ec-link">
            Estoque
          </Link>{' '}
          · Café cru · Saldo atual
        </div>

        <AbasCafeCru />

        <div className="kx-cabecalho">
          <h1 className="kx-titulo">Saldo do café cru</h1>
        </div>

        {/* Totais gerais */}
        <div className="kx-totais" style={{ marginTop: 0, marginBottom: 22 }}>
          <div className="kx-total">
            <span className="kx-total-label">Saldo total</span>
            <strong className="kx-total-valor">{formatarKg(saldo)}</strong>
          </div>
          <div className="kx-total">
            <span className="kx-total-label">Custo médio geral</span>
            <strong className="kx-total-valor">{formatarMoeda(custoMedio)}</strong>
          </div>
          <div className="kx-total">
            <span className="kx-total-label">Valor total em estoque</span>
            <strong className="kx-total-valor">{formatarMoeda(valorTotal)}</strong>
          </div>
        </div>

        {/* Por fazenda + variedade */}
        <p className="kx-filtro-label" style={{ marginBottom: 10 }}>
          Custo médio por fazenda + variedade
        </p>
        <div className="kx-tabela-wrap">
          <table className="kx-tabela">
            <thead>
              <tr>
                <th>Fazenda</th>
                <th>Variedade</th>
                <th className="kx-num">Saldo</th>
                <th className="kx-num">Custo médio / kg</th>
                <th className="kx-num">Valor total</th>
              </tr>
            </thead>
            <tbody>
              {grupos.length === 0 && (
                <tr>
                  <td colSpan={5} className="kx-vazio">
                    Nenhum saldo de café cru em estoque.
                  </td>
                </tr>
              )}
              {grupos.map((g) => (
                <tr key={g.chave}>
                  <td style={{ fontWeight: 700, color: 'var(--verde)' }}>
                    {g.produtor || <span className="cp-muted">—</span>}
                  </td>
                  <td>{g.variedade || <span className="cp-muted">—</span>}</td>
                  <td className="kx-num">{formatarKg(g.saldoAtual)}</td>
                  <td className="kx-num">{formatarMoeda(g.custoMedio)}</td>
                  <td className="kx-num">{formatarMoeda(g.valorTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="sa-rodape" style={{ marginTop: 16 }}>
          Última atualização: {total.ultimaAtualizacao || '—'}
        </div>
      </main>
    </div>
  )
}
