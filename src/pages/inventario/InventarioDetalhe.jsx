import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Topbar from '../../components/Topbar'
import { formatarData, hojeISO } from '../../utils/formato'
import { registrarLog, ACOES } from '../../utils/auditoria'
import { nomeUsuarioAtual } from '../../utils/permissoes'
import { carregarInventario, resumoInventario, ROTULO_CATEGORIA } from '../../utils/inventario'
import '../estoque/CafeCru.css'
import './Inventario.css'

function fmtNum(n) {
  return (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}
function numeroBR(n) {
  return (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function InventarioDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const inv = useMemo(() => carregarInventario(id), [id])

  if (!inv) {
    return (
      <div className="pagina">
        <Topbar />
        <main className="conteudo">
          <p>Inventário não encontrado.</p>
          <Link to="/inventario" className="btn btn-ghost">
            Voltar
          </Link>
        </main>
      </div>
    )
  }

  const resumo = resumoInventario(inv)

  function exportarCSV() {
    const cab = ['Categoria', 'Referência', 'Descrição', 'Saldo sistema', 'Contagem física', 'Diferença', 'Status', 'Regularização']
    const linhas = inv.itens.map((it) => [
      ROTULO_CATEGORIA[it.categoria] || it.categoria,
      it.referencia,
      it.descricao,
      numeroBR(it.saldoSistema),
      numeroBR(it.saldoFisico),
      numeroBR(it.diferenca),
      it.status,
      it.regularizacao ? `${it.regularizacao.tipo}: ${it.regularizacao.descricao}` : '',
    ])
    const csv = [cab, ...linhas]
      .map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inventario-${inv.data}-${hojeISO()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    registrarLog(nomeUsuarioAtual(), 'Inventário', ACOES.EXPORTOU, `Exportou inventário ${formatarData(inv.data)} (CSV)`)
  }

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="kx-breadcrumb">
          <Link to="/inventario" className="ec-link">
            Inventário
          </Link>{' '}
          · Detalhes
        </div>

        <div className="kx-cabecalho">
          <div>
            <h1 className="kx-titulo">Inventário {formatarData(inv.data)}</h1>
            <span className="inv-resumo-sub">
              {inv.tipo} · {inv.status} · por {inv.criadoPor}
              {inv.concluidoEm ? ` · concluído em ${formatarData(inv.concluidoEm)}` : ''}
            </span>
          </div>
          <div className="kx-acoes-topo">
            {inv.status === 'Rascunho' && (
              <button
                className="btn btn-ghost"
                onClick={() => navigate('/inventario/novo', { state: { continuarId: inv.id } })}
              >
                Continuar
              </button>
            )}
            <button className="btn btn-secondary" onClick={exportarCSV}>
              ⬇ Exportar CSV
            </button>
          </div>
        </div>

        <div className="kx-totais" style={{ marginTop: 0, marginBottom: 20 }}>
          <div className="kx-total entra">
            <span className="kx-total-label">Itens OK</span>
            <strong className="kx-total-valor">{resumo.ok}</strong>
          </div>
          <div className="kx-total sai">
            <span className="kx-total-label">Com diferença</span>
            <strong className="kx-total-valor">{resumo.comDiferenca}</strong>
          </div>
          <div className="kx-total">
            <span className="kx-total-label">Sobras · Faltas</span>
            <strong className="kx-total-valor">
              {resumo.sobras} · {resumo.faltas}
            </strong>
          </div>
        </div>

        <div className="kx-tabela-wrap">
          <table className="kx-tabela">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Item</th>
                <th className="kx-num">Saldo sistema</th>
                <th className="kx-num">Contagem</th>
                <th className="kx-num">Diferença</th>
                <th>Status</th>
                <th>Regularização</th>
              </tr>
            </thead>
            <tbody>
              {inv.itens.map((it, i) => (
                <tr key={i}>
                  <td>{ROTULO_CATEGORIA[it.categoria] || it.categoria}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{it.referencia}</div>
                    <div className="cp-muted" style={{ fontSize: 12.5 }}>
                      {it.descricao}
                    </div>
                  </td>
                  <td className="kx-num">
                    {fmtNum(it.saldoSistema)} {it.unidade}
                  </td>
                  <td className="kx-num">
                    {fmtNum(it.saldoFisico)} {it.unidade}
                  </td>
                  <td
                    className={`kx-num inv-dif ${
                      it.diferenca > 1e-9 ? 'pos' : it.diferenca < -1e-9 ? 'neg' : 'zero'
                    }`}
                  >
                    {it.diferenca > 0 ? '+' : ''}
                    {fmtNum(it.diferenca)}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        it.status === 'ok' ? 'badge-pago' : it.status === 'sobra' ? 'badge-a-pagar' : 'badge-vencido'
                      }`}
                    >
                      {it.status}
                    </span>
                  </td>
                  <td className="kx-desc">
                    {it.regularizacao ? (
                      <span>{it.regularizacao.descricao}</span>
                    ) : it.status === 'ok' ? (
                      <span className="cp-muted">—</span>
                    ) : (
                      <span className="cp-muted">pendente</span>
                    )}
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
