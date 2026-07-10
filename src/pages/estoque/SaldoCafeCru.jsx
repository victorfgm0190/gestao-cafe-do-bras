import { useState } from 'react'
import { Link } from 'react-router-dom'
import Topbar from '../../components/Topbar'
import AbasCafeCru from './AbasCafeCru'
import { formatarMoeda, formatarKg } from '../../utils/formato'
import { carregarEstoqueResumo, garantirKardexInicial } from '../../utils/kardex'
import './CafeCru.css'

// Garante que o resumo exista (semeia do estoque de lotes na primeira visita).
garantirKardexInicial()

export default function SaldoCafeCru() {
  const [resumo] = useState(carregarEstoqueResumo)

  const saldo = Number(resumo.saldoAtual) || 0
  const custoMedio = Number(resumo.custoMedio) || 0
  const valorTotal = saldo * custoMedio

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="kx-breadcrumb">
          <Link to="/estoque" className="ec-link">
            Estoque
          </Link>{' '}
          · Saldo atual do café cru
        </div>

        <AbasCafeCru />

        <h1 className="kx-titulo" style={{ marginBottom: 20 }}>
          Saldo atual do café cru
        </h1>

        <div className="sa-card">
          <div className="sa-topo">
            <span className="sa-icone">🌱</span>
            <h2>Café cru em estoque</h2>
          </div>

          <div className="sa-linhas">
            <div className="sa-item">
              <span className="sa-item-label">Saldo em estoque</span>
              <strong className="sa-item-valor">{formatarKg(saldo)}</strong>
            </div>
            <div className="sa-item">
              <span className="sa-item-label">Custo médio / kg</span>
              <strong className="sa-item-valor dourado">{formatarMoeda(custoMedio)}</strong>
            </div>
            <div className="sa-item">
              <span className="sa-item-label">Valor total em estoque</span>
              <strong className="sa-item-valor">{formatarMoeda(valorTotal)}</strong>
            </div>
          </div>

          <div className="sa-rodape">
            Última atualização: {resumo.ultimaAtualizacao || '—'}
          </div>
        </div>
      </main>
    </div>
  )
}
