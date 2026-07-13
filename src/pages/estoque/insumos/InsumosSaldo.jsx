import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Topbar from '../../../components/Topbar'
import AbasInsumos from './AbasInsumos'
import { formatarMoeda } from '../../../utils/formato'
import { carregarCadastro, resumoPorInsumo, formatarQuantidade } from '../../../utils/insumos'
import '../CafeCru.css'
import './Insumos.css'

export default function InsumosSaldo() {
  const [linhas, setLinhas] = useState([])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const insumos = await carregarCadastro()
      const resumo = await resumoPorInsumo()
      const r = insumos.map((i) => {
        const res = resumo[i.id] || { saldoAtual: 0, custoMedio: 0 }
        const saldo = Number(res.saldoAtual) || 0
        const custoMedio = Number(res.custoMedio) || 0
        const minimo = Number(i.estoqueMinimo) || 0
        return {
          ...i,
          saldo,
          custoMedio,
          valorTotal: saldo * custoMedio,
          abaixo: saldo < minimo,
        }
      })
      if (vivo) setLinhas(r)
    })()
    return () => {
      vivo = false
    }
  }, [])

  const valorGeral = useMemo(
    () => linhas.reduce((soma, l) => soma + l.valorTotal, 0),
    [linhas],
  )
  const qtdAlertas = useMemo(() => linhas.filter((l) => l.abaixo).length, [linhas])

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="kx-breadcrumb">
          <Link to="/estoque" className="ec-link">
            Estoque
          </Link>{' '}
          · Insumos · Saldo
        </div>

        <AbasInsumos />

        <div className="kx-cabecalho">
          <h1 className="kx-titulo">Saldo de insumos</h1>
        </div>

        <div className="kx-totais" style={{ marginTop: 0, marginBottom: 18 }}>
          <div className="kx-total">
            <span className="kx-total-label">Valor total em estoque</span>
            <strong className="kx-total-valor">{formatarMoeda(valorGeral)}</strong>
          </div>
          <div className={`kx-total ${qtdAlertas > 0 ? 'sai' : 'entra'}`}>
            <span className="kx-total-label">Insumos abaixo do mínimo</span>
            <strong className="kx-total-valor">{qtdAlertas}</strong>
          </div>
          <div className="kx-total">
            <span className="kx-total-label">Insumos cadastrados</span>
            <strong className="kx-total-valor">{linhas.length}</strong>
          </div>
        </div>

        <div className="kx-tabela-wrap">
          <table className="kx-tabela">
            <thead>
              <tr>
                <th>Insumo</th>
                <th>Unidade</th>
                <th className="kx-num">Saldo atual</th>
                <th className="kx-num">Estoque mínimo</th>
                <th className="kx-num">Custo médio</th>
                <th className="kx-num">Valor total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={7} className="kx-vazio">
                    Nenhum insumo cadastrado.
                  </td>
                </tr>
              )}
              {linhas.map((l) => (
                <tr key={l.id} className={l.abaixo ? 'in-alerta' : ''}>
                  <td style={{ fontWeight: 700, color: 'var(--verde)' }}>{l.nome}</td>
                  <td>{l.unidade}</td>
                  <td className="kx-num">{formatarQuantidade(l.saldo, l.unidade)}</td>
                  <td className="kx-num">{formatarQuantidade(l.estoqueMinimo, l.unidade)}</td>
                  <td className="kx-num">{formatarMoeda(l.custoMedio)}</td>
                  <td className="kx-num">{formatarMoeda(l.valorTotal)}</td>
                  <td>
                    <span className={`badge ${l.abaixo ? 'badge-vencido' : 'badge-pago'}`}>
                      {l.abaixo ? 'Abaixo do mínimo' : 'OK'}
                    </span>
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
