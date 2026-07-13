import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Topbar from '../../../components/Topbar'
import AbasTorrado from './AbasTorrado'
import { formatarMoeda, formatarKg } from '../../../utils/formato'
import { carregarEstoqueTorrado } from '../../../utils/torrado'
import '../CafeCru.css'
import './Torrado.css'

const SALDO_MINIMO = 10 // kg

export default function TorradoSaldo() {
  const [resumo, setResumo] = useState({ saldoAtual: 0, custoMedio: 0, ultimaAtualizacao: '' })

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const dados = await carregarEstoqueTorrado()
      if (vivo) setResumo(dados)
    })()
    return () => {
      vivo = false
    }
  }, [])

  const saldo = Number(resumo.saldoAtual) || 0
  const custoMedio = Number(resumo.custoMedio) || 0
  const valorTotal = saldo * custoMedio
  const alerta = saldo < SALDO_MINIMO

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="kx-breadcrumb">
          <Link to="/estoque" className="ec-link">
            Estoque
          </Link>{' '}
          · Café torrado · Saldo atual
        </div>

        <AbasTorrado />

        <h1 className="kx-titulo" style={{ marginBottom: 20 }}>
          Saldo do café torrado
        </h1>

        {alerta && (
          <div className="tr-alerta-banner">
            ⚠️ Saldo abaixo de {formatarKg(SALDO_MINIMO)} — considere programar novas torras.
          </div>
        )}

        <div className="sa-card">
          <div className="sa-topo">
            <span className="sa-icone">🔥</span>
            <h2>Café torrado em estoque</h2>
          </div>

          <div className="sa-linhas">
            <div className="sa-item">
              <span className="sa-item-label">Saldo atual</span>
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

          <div className="sa-rodape">Última atualização: {resumo.ultimaAtualizacao || '—'}</div>
        </div>
      </main>
    </div>
  )
}
