import { useEffect, useMemo, useState } from 'react'
import { formatarMoeda, formatarKg } from '../../utils/formato'
import { criarVinculo, formatarCustoKg, listarLotesCru } from '../../utils/vinculos'
import '../estoque/CafeCru.css'
import './Boletos.css'

const q4 = (v) => Math.round(Number(v) * 10000) / 10000

// Vincula um boleto a um lote de café cru e dispara a cascata de custo.
// O que a cascata faz (api/vinculos.js): o custo do lote vira o valor do
// boleto, o kardex acompanha, a média do grupo fazenda+variedade é refeita e
// o pa_estoque dos PAs que declaram esse grupo é recalculado.
export default function ModalVinculo({ boleto, aoFechar, aoVincular }) {
  const [lotes, setLotes] = useState([])
  const [carregandoLotes, setCarregandoLotes] = useState(true)
  const [erroLotes, setErroLotes] = useState('')
  const [loteId, setLoteId] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await listarLotesCru()
        if (!vivo) return
        setLotes((r.lotes || []).filter((l) => Number(l.peso_kg) > 0))
      } catch (e) {
        // A rota de lotes exige o módulo "Estoque MP"; o perfil Financeiro tem
        // "Contas a Pagar" mas não aquele, e cai aqui com 403.
        if (vivo) setErroLotes(e.message || 'Não foi possível carregar os lotes.')
      } finally {
        if (vivo) setCarregandoLotes(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [])

  const lote = useMemo(
    () => lotes.find((l) => String(l.id) === String(loteId)) || null,
    [lotes, loteId],
  )

  const valorBoleto = Number(boleto.valor_total)
  const custoNovo = lote ? q4(valorBoleto / Number(lote.peso_kg)) : null
  const custoAtual = lote ? q4(lote.preco_kg) : null

  async function confirmar() {
    if (!lote) {
      setErro('Selecione o lote de café cru.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const r = await criarVinculo({ boletoId: boleto.id, cafeCruLoteId: lote.id })
      setResultado(r)
    } catch (e) {
      setErro(e.message || 'Falha ao criar o vínculo.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="kx-overlay" onMouseDown={aoFechar}>
      <div className="kx-modal bo-modal-largo" onMouseDown={(e) => e.stopPropagation()}>
        <div className="kx-modal-topo">
          <h2>{resultado ? 'Vínculo criado' : `Vincular boleto #${boleto.id}`}</h2>
          <button className="kx-fechar" onClick={aoFechar} aria-label="Fechar">
            ✕
          </button>
        </div>

        {resultado ? (
          <div className="kx-form">
            <div className="bo-msg ok">{resultado.message}</div>

            <div className="bo-previa">
              Custo aplicado ao lote: <strong>{formatarCustoKg(resultado.custo_calculado)}/kg</strong>
              <br />
              Grupo <strong>{resultado.grupo?.chave}</strong> — custo médio{' '}
              <strong>{formatarCustoKg(resultado.grupo?.custo_medio)}/kg</strong> sobre{' '}
              <strong>{formatarKg(resultado.grupo?.saldo_kg)}</strong> em saldo.
              <br />
              PAs afetados: <strong>{resultado.impacto?.pa_afetados ?? 0}</strong> · movimentos de
              estoque atualizados: <strong>{resultado.impacto?.movimentos_atualizados ?? 0}</strong>
            </div>

            {(resultado.impacto?.detalhes || []).length > 0 && (
              <div>
                <div className="bo-detalhe-titulo">Movimentos de PA recalculados</div>
                <table className="bo-parcelas">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Gramatura</th>
                      <th className="num">Qtd.</th>
                      <th className="num">Custo antes</th>
                      <th className="num">Custo depois</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.impacto.detalhes.map((d) => (
                      <tr key={d.pa_estoque_id}>
                        <td>{d.pa_nome}</td>
                        <td>{d.gramatura}</td>
                        <td className="num">{d.quantidade}</td>
                        <td className="num">{formatarCustoKg(d.custo_antes)}</td>
                        <td className="num">{formatarCustoKg(d.custo_depois)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="campo-ajuda" style={{ marginTop: 10 }}>
                  O custo gravado é por <strong>kg</strong> num campo que é custo por{' '}
                  <strong>pacote</strong>: o pacote de 250 g fica com o mesmo custo do de 1 kg, e
                  perda de torra e embalagem não entram. Use &ldquo;Desfazer&rdquo; na aba Vínculos
                  se o resultado não for o esperado.
                </p>
              </div>
            )}

            <div className="kx-form-acoes">
              <button className="btn btn-primary" onClick={aoVincular}>
                Concluir
              </button>
            </div>
          </div>
        ) : (
          <div className="kx-form">
            <div className="bo-previa">
              Boleto de <strong>{boleto.fornecedor}</strong> —{' '}
              <strong>{formatarMoeda(valorBoleto)}</strong> em{' '}
              <strong>{boleto.parcelas_quantidade}x</strong>. O valor total do boleto passa a ser o
              custo do lote escolhido.
            </div>

            {erroLotes && (
              <div className="bo-msg erro">
                {erroLotes}
                <br />
                Listar lotes exige permissão no módulo <strong>Estoque MP</strong>.
              </div>
            )}

            <label className="campo">
              <span className="campo-label">
                Lote de café cru <span className="obrig">*</span>
              </span>
              <select
                value={loteId}
                onChange={(e) => setLoteId(e.target.value)}
                disabled={carregandoLotes || !!erroLotes}
              >
                <option value="">
                  {carregandoLotes ? 'Carregando lotes...' : 'Selecione o lote'}
                </option>
                {lotes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo_lote} — {l.fazenda} / {l.variedade} — {formatarKg(l.peso_kg)}
                  </option>
                ))}
              </select>
            </label>

            {lote && (
              <div className="bo-previa">
                Peso do lote: <strong>{formatarKg(lote.peso_kg)}</strong>
                <br />
                Custo/kg atual: <strong>{formatarCustoKg(custoAtual)}</strong> → novo:{' '}
                <strong>{formatarCustoKg(custoNovo)}</strong>
                <br />
                Grupo afetado:{' '}
                <strong>
                  {lote.fazenda} · {lote.variedade}
                </strong>
              </div>
            )}

            {erro && <div className="bo-msg erro">{erro}</div>}

            <div className="kx-form-acoes">
              <button className="btn btn-ghost" onClick={aoFechar} disabled={salvando}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={confirmar} disabled={salvando || !lote}>
                {salvando ? 'Vinculando...' : 'Vincular e recalcular'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
