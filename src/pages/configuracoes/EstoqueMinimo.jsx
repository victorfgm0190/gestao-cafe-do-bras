import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Topbar from '../../components/Topbar'
import { registrarLog, ACOES } from '../../utils/auditoria'
import { nomeUsuarioAtual } from '../../utils/permissoes'
import { itensMonitoraveis, salvarConfig, carregarConfig } from '../../utils/estoqueMinimo'
import '../estoque/CafeCru.css'

export default function EstoqueMinimo() {
  const itens = useMemo(() => itensMonitoraveis(), [])
  const [valores, setValores] = useState(() => {
    const v = {}
    for (const it of itens) v[it.chave] = String(it.minimo ?? 0)
    return v
  })
  const [salvo, setSalvo] = useState(false)

  function atualizar(chave, valor) {
    setValores((v) => ({ ...v, [chave]: valor }))
    setSalvo(false)
  }

  function salvar() {
    const cfg = carregarConfig()
    for (const it of itens) {
      const n = Number(String(valores[it.chave]).replace(',', '.'))
      cfg[it.chave] = Number.isNaN(n) || n < 0 ? 0 : n
    }
    salvarConfig(cfg)
    registrarLog(nomeUsuarioAtual(), 'Configurações', ACOES.ALTEROU, 'Atualizou os estoques mínimos')
    setSalvo(true)
  }

  // Agrupa por tipo para exibição
  const grupos = useMemo(() => {
    const mapa = {}
    for (const it of itens) {
      ;(mapa[it.tipo] = mapa[it.tipo] || []).push(it)
    }
    return mapa
  }, [itens])

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="kx-breadcrumb">
          <Link to="/dashboard" className="ec-link">
            Início
          </Link>{' '}
          · Configurações · Estoque mínimo
        </div>

        <div className="kx-cabecalho">
          <h1 className="kx-titulo">Estoque mínimo</h1>
          <button className="btn btn-primary" onClick={salvar}>
            Salvar
          </button>
        </div>

        {salvo && (
          <div
            style={{
              background: 'var(--success-bg)',
              color: 'var(--success)',
              padding: '12px 16px',
              borderRadius: 8,
              fontWeight: 600,
              marginBottom: 18,
            }}
          >
            Estoques mínimos salvos.
          </div>
        )}

        {Object.entries(grupos).map(([tipo, lista]) => (
          <div key={tipo} style={{ marginBottom: 24 }}>
            <h2 className="kx-titulo" style={{ fontSize: 17, marginBottom: 12 }}>
              {tipo}
            </h2>
            <div className="kx-tabela-wrap">
              <table className="kx-tabela">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="kx-num">Saldo atual</th>
                    <th className="kx-num">Estoque mínimo</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((it) => {
                    const abaixo =
                      Number(valores[it.chave]) > 0 && it.saldoAtual < Number(valores[it.chave])
                    return (
                      <tr key={it.chave}>
                        <td style={{ fontWeight: 600 }}>{it.nome}</td>
                        <td className={`kx-num ${abaixo ? 'kx-sai' : ''}`}>
                          {it.saldoAtual.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {it.unidade}
                        </td>
                        <td className="kx-num">
                          <input
                            type="number"
                            min="0"
                            step={it.unidade === 'kg' ? '0.1' : '1'}
                            value={valores[it.chave]}
                            onChange={(e) => atualizar(it.chave, e.target.value)}
                            style={{
                              width: 110,
                              padding: '8px 10px',
                              border: 'var(--border)',
                              borderRadius: 'var(--radius-sm)',
                              textAlign: 'right',
                              fontWeight: 600,
                            }}
                          />{' '}
                          {it.unidade}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </main>
    </div>
  )
}
