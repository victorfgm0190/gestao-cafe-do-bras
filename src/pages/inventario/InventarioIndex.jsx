import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Topbar from '../../components/Topbar'
import { formatarData } from '../../utils/formato'
import { registrarLog, ACOES } from '../../utils/auditoria'
import { nomeUsuarioAtual } from '../../utils/permissoes'
import {
  carregarInventarios,
  excluirInventario,
  resumoInventario,
  TIPOS_INVENTARIO,
} from '../../utils/inventario'
import '../estoque/CafeCru.css'
import './Inventario.css'

export default function InventarioIndex() {
  const navigate = useNavigate()
  const [inventarios, setInventarios] = useState([])
  const [modalTipo, setModalTipo] = useState(false)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const lista = await carregarInventarios()
      if (vivo) setInventarios(lista)
    })()
    return () => {
      vivo = false
    }
  }, [])

  const ordenados = useMemo(
    () => [...inventarios].sort((a, b) => (b.data || '').localeCompare(a.data || '') || b.id - a.id),
    [inventarios],
  )
  const ultimo = ordenados.find((i) => i.status === 'Concluído') || ordenados[0] || null

  function novoInventario(tipo) {
    setModalTipo(false)
    navigate('/inventario/novo', { state: { tipo } })
  }

  async function excluir(inv) {
    if (window.confirm('Excluir este inventário? Esta ação não pode ser desfeita.')) {
      await excluirInventario(inv.id)
      registrarLog(nomeUsuarioAtual(), 'Inventário', ACOES.EXCLUIU, `Excluiu inventário ${formatarData(inv.data)} (${inv.tipo})`)
      setInventarios(await carregarInventarios())
    }
  }

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="kx-cabecalho">
          <div>
            <div className="kx-breadcrumb">Inventário</div>
            <h1 className="kx-titulo">Inventário inteligente</h1>
          </div>
          <button className="btn btn-primary" onClick={() => setModalTipo(true)}>
            + Novo Inventário
          </button>
        </div>

        {/* Resumo */}
        <div className="kx-totais" style={{ marginTop: 0, marginBottom: 24 }}>
          <div className="kx-total">
            <span className="kx-total-label">Último inventário</span>
            <strong className="kx-total-valor">{ultimo ? formatarData(ultimo.data) : '—'}</strong>
            <span className="inv-resumo-sub">{ultimo ? `${ultimo.tipo} · ${ultimo.status}` : 'Nenhum realizado'}</span>
          </div>
          <div className="kx-total">
            <span className="kx-total-label">Total de inventários</span>
            <strong className="kx-total-valor">{inventarios.length}</strong>
          </div>
        </div>

        {/* Histórico */}
        <div className="kx-tabela-wrap">
          <table className="kx-tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Status</th>
                <th className="kx-num">Itens OK</th>
                <th className="kx-num">Diferenças</th>
                <th className="kx-num">Ações</th>
              </tr>
            </thead>
            <tbody>
              {ordenados.length === 0 && (
                <tr>
                  <td colSpan={6} className="kx-vazio">
                    Nenhum inventário realizado ainda.
                  </td>
                </tr>
              )}
              {ordenados.map((inv) => {
                const r = resumoInventario(inv)
                return (
                  <tr key={inv.id}>
                    <td>{formatarData(inv.data)}</td>
                    <td>{inv.tipo}</td>
                    <td>
                      <span className={`badge ${inv.status === 'Concluído' ? 'badge-pago' : 'badge-a-pagar'}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="kx-num">{r.ok}</td>
                    <td className="kx-num">{r.comDiferenca}</td>
                    <td className="kx-num">
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button className="kx-limpar" onClick={() => navigate(`/inventario/${inv.id}`)}>
                          Ver
                        </button>
                        {inv.status === 'Rascunho' && (
                          <button
                            className="kx-limpar"
                            onClick={() => navigate('/inventario/novo', { state: { continuarId: inv.id } })}
                          >
                            Continuar
                          </button>
                        )}
                        <button className="kx-limpar" onClick={() => excluir(inv)}>
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modal de tipo */}
      {modalTipo && (
        <div className="kx-overlay" onMouseDown={() => setModalTipo(false)}>
          <div className="kx-modal" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="kx-modal-topo">
              <h2>Novo inventário</h2>
              <button className="kx-fechar" onClick={() => setModalTipo(false)} aria-label="Fechar">
                ✕
              </button>
            </div>
            <div className="kx-form">
              <p className="campo-ajuda">Selecione o tipo de inventário:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {TIPOS_INVENTARIO.map((t) => (
                  <button key={t} className="btn btn-secondary" onClick={() => novoInventario(t)}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
