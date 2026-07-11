import { useNavigate } from 'react-router-dom'
import { formatarMoeda, formatarData } from '../utils/formato'
import './RelatorioImpacto.css'

function rotuloTipo(mov) {
  if (mov.tipo === 'Saída') return 'Saída produção'
  return mov.tipo
}

// Modal de relatório exibido após um recálculo em cascata.
// rel: { entrada, custoMedioAntes, custoMedioDepois, movimentacoesAfetadas, ordens }
export default function RelatorioImpacto({ rel, onFechar }) {
  const navigate = useNavigate()
  if (!rel) return null

  const movs = rel.movimentacoesAfetadas || []
  const ordens = rel.ordens || []

  return (
    <div className="ri-overlay" onMouseDown={onFechar}>
      <div className="ri-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ri-topo">
          <span className="ri-icone">⚠️</span>
          <h2>Recálculo em cascata concluído</h2>
        </div>

        {/* Entrada editada */}
        {rel.entrada && (
          <div className="ri-secao">
            <div className="ri-secao-tit">Entrada editada</div>
            <div className="ri-entrada">
              {[rel.entrada.produtor, rel.entrada.variedade].filter(Boolean).join(' ') || '—'} —{' '}
              {rel.entrada.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg
            </div>
            <div className="ri-custo">
              Custo: {formatarMoeda(rel.entrada.custoAntes)} →{' '}
              <strong>{formatarMoeda(rel.entrada.custoDepois)}/kg</strong>
            </div>
          </div>
        )}

        {/* Impacto no kardex */}
        <div className="ri-secao">
          <div className="ri-secao-tit">Impacto no kardex ({movs.length} movimentações)</div>
          {movs.length === 0 ? (
            <div className="ri-vazio">Nenhuma saída/ajuste afetado.</div>
          ) : (
            <ul className="ri-lista">
              {movs.map((m) => (
                <li key={m.id}>
                  <span className="ri-data">{formatarData(m.data)}</span> {rotuloTipo(m)}:{' '}
                  {formatarMoeda(m.custoTotalAntes)} → <strong>{formatarMoeda(m.custoTotalDepois)}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Impacto nas ordens */}
        {ordens.length > 0 && (
          <div className="ri-secao">
            <div className="ri-secao-tit">Impacto nas ordens de produção ({ordens.length} ordens)</div>
            <ul className="ri-lista">
              {ordens.map((o) => (
                <li key={o.ordemId}>
                  <span className="ri-data">{formatarData(o.data)}</span> {o.paNome}
                  <ul className="ri-sublista">
                    {o.itens.map((it) => (
                      <li key={it.gramatura}>
                        {it.quantidade}× {it.gramatura === 1000 ? '1kg' : `${it.gramatura}g`}: custo/pacote{' '}
                        {formatarMoeda(it.custoUnitarioAntes)} →{' '}
                        <strong>{formatarMoeda(it.custoUnitarioDepois)}</strong>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="ri-atual">
          Custo médio atual: <strong>{formatarMoeda(rel.custoMedioDepois)}/kg</strong>
        </div>

        <div className="ri-acoes">
          <button className="btn btn-ghost" onClick={onFechar}>
            Fechar
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              onFechar()
              navigate('/estoque/kardex')
            }}
          >
            Ver Kardex
          </button>
        </div>
      </div>
    </div>
  )
}
