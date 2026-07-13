import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Topbar from '../../../components/Topbar'
import AbasPA from './AbasPA'
import { formatarMoeda, hojeISO } from '../../../utils/formato'
import { registrarLog, ACOES } from '../../../utils/auditoria'
import { nomeUsuarioAtual } from '../../../utils/permissoes'
import {
  carregarPA,
  lotesCruDisponiveis,
  calcularOrdem,
  registrarOrdem,
  formatarGramatura,
  embalagemDoPA,
} from '../../../utils/pa'
import { carregarCadastro as carregarInsumos, resumoPorInsumo } from '../../../utils/insumos'
import '../CafeCru.css'
import './PA.css'

// Pesos são informados/exibidos em GRAMAS nesta tela; o backend trabalha em kg.
function g0(n) {
  return `${Math.round(Number(n) || 0).toLocaleString('pt-BR')} g`
}
const gToKg = (v) => (Number(String(v).replace(',', '.')) || 0) / 1000

export default function OrdemProducao() {
  const navigate = useNavigate()
  const [pas, setPas] = useState([])
  const [lotesCru, setLotesCru] = useState([])
  const [insumos, setInsumos] = useState([])
  const [resumoInsumos, setResumoInsumos] = useState({})

  useEffect(() => {
    ;(async () => setLotesCru(await lotesCruDisponiveis()))()
  }, [])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const [listaPas, listaInsumos, resumo] = await Promise.all([
        carregarPA(),
        carregarInsumos(),
        resumoPorInsumo(),
      ])
      if (vivo) {
        setPas(listaPas.filter((p) => p.ativo !== false))
        setInsumos(listaInsumos)
        setResumoInsumos(resumo)
      }
    })()
    return () => {
      vivo = false
    }
  }, [])

  const [data, setData] = useState(hojeISO())
  const [paId, setPaId] = useState('')
  const [quantidades, setQuantidades] = useState({}) // { [gramatura]: qtd }
  const [linhasLote, setLinhasLote] = useState([{ loteId: '', g: '' }]) // g = gramas
  const [sobra, setSobra] = useState('') // gramas
  const [erros, setErros] = useState({})

  const pa = pas.find((p) => p.id === Number(paId)) || null

  const itensInput = useMemo(
    () => (pa?.gramaturas || []).map((g) => ({ gramatura: g, quantidade: Number(quantidades[g]) || 0 })),
    [pa, quantidades],
  )

  // Converte os pesos informados em gramas para kg (formato do backend).
  const lotesKg = useMemo(
    () => linhasLote.map((l) => ({ loteId: l.loteId, kg: gToKg(l.g) })),
    [linhasLote],
  )
  const sobraKg = gToKg(sobra)

  const [calc, setCalc] = useState({
    pa: null,
    lotes: [],
    totalCru: 0,
    custoTotalCru: 0,
    totalKgEmbalado: 0,
    custoKgEmbalado: 0,
    itens: [],
    sobra: 0,
    perda: 0,
    custoTotalCafe: 0,
    custoTotalEmbalagens: 0,
    custoTotalGeral: 0,
  })

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const r = await calcularOrdem({ paId, itens: itensInput, lotes: lotesKg, sobra: sobraKg })
      if (vivo) setCalc(r)
    })()
    return () => {
      vivo = false
    }
  }, [paId, itensInput, lotesKg, sobraKg])

  // ---- Perda esperada × real (tudo em gramas) ----
  const perdaPadrao = Number(pa?.perdaTorraPadrao) || 0
  const pesoEmbaladoG = (Number(calc.totalKgEmbalado) || 0) * 1000
  const sugestaoCruG =
    perdaPadrao > 0 && perdaPadrao < 100 && pesoEmbaladoG > 0
      ? pesoEmbaladoG / (1 - perdaPadrao / 100)
      : pesoEmbaladoG
  const cafeUsadoG = (Number(calc.totalCru) || 0) * 1000
  const sobraG = (Number(calc.sobra) || 0) * 1000
  const perdaRealG = (Number(calc.perda) || 0) * 1000
  const perdaRealPct = cafeUsadoG > 0 ? (perdaRealG / cafeUsadoG) * 100 : 0
  const perdaEsperadaG = cafeUsadoG * (perdaPadrao / 100)
  const excedenteG = perdaRealG - perdaEsperadaG
  const dentroEsperado = perdaRealPct <= perdaPadrao + 1e-9

  function embSaldo(gramatura) {
    const id = embalagemDoPA(pa, gramatura)
    if (!id) return null
    return {
      nome: insumos.find((i) => i.id === id)?.nome || 'Embalagem',
      saldo: Number(resumoInsumos[id]?.saldoAtual) || 0,
    }
  }

  function setQtd(g, valor) {
    setQuantidades((q) => ({ ...q, [g]: valor }))
  }
  function atualizarLinha(i, campo, valor) {
    setLinhasLote((linhas) => linhas.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)))
  }
  function adicionarLinha() {
    setLinhasLote((l) => [...l, { loteId: '', g: '' }])
  }
  function removerLinha(i) {
    setLinhasLote((l) => (l.length > 1 ? l.filter((_, idx) => idx !== i) : l))
  }

  function validar() {
    const e = {}
    if (!paId) e.paId = 'Selecione o produto.'
    const algumaQtd = itensInput.some((it) => it.quantidade > 0)
    if (!algumaQtd) e.itens = 'Informe a quantidade de pelo menos uma gramatura.'

    const linhasValidas = linhasLote.filter((l) => l.loteId && gToKg(l.g) > 0)
    if (linhasValidas.length === 0) e.lotes = 'Adicione ao menos um lote com quantidade.'

    const somaPorLote = {}
    for (const l of linhasValidas) {
      somaPorLote[l.loteId] = (somaPorLote[l.loteId] || 0) + gToKg(l.g)
    }
    for (const [loteId, kg] of Object.entries(somaPorLote)) {
      const lote = lotesCru.find((x) => x.id === Number(loteId))
      if (lote && kg > (Number(lote.saldoDisponivel) || 0)) {
        e.lotes = `Lote ${lote.codigo}: máximo ${g0((Number(lote.saldoDisponivel) || 0) * 1000)} disponível.`
      }
    }

    if (sobraKg < 0) e.sobra = 'Sobra inválida.'
    if (Number(calc.perda) < -1e-9) e.sobra = 'Embalado + sobra excedem o café cru utilizado.'

    setErros(e)
    return Object.keys(e).length === 0
  }

  async function confirmar() {
    if (!validar()) return

    const ordem = await registrarOrdem({ data, paId, itens: itensInput, lotes: lotesKg, sobra: sobraKg })

    registrarLog(
      nomeUsuarioAtual(),
      'Estoque PA',
      ACOES.INCLUIU,
      `Produção: ${ordem.paNome} — ${ordem.itens.map((it) => `${it.quantidade}×${formatarGramatura(it.gramatura)}`).join(', ')} (${formatarMoeda(ordem.custoTotal)})`,
    )

    setPaId('')
    setQuantidades({})
    setLinhasLote([{ loteId: '', g: '' }])
    setSobra('')
    setErros({})
    setLotesCru(await lotesCruDisponiveis())
    navigate('/estoque/pa/historico')
  }

  const podeConfirmar = paId && itensInput.some((it) => it.quantidade > 0) && Number(calc.totalCru) > 0

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="kx-breadcrumb">
          <Link to="/estoque" className="ec-link">
            Estoque
          </Link>{' '}
          · Produtos acabados · Ordem de produção
        </div>

        <AbasPA />

        <h1 className="kx-titulo" style={{ marginBottom: 20 }}>
          Ordem de produção
        </h1>

        {/* ETAPA 1 */}
        <section className="pa-etapa">
          <div className="pa-etapa-titulo">
            <span className="pa-etapa-num">1</span> O que produziu
          </div>
          <div className="pa-form-linha">
            <label className="campo">
              <span className="campo-label">Data</span>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </label>
            <label className="campo">
              <span className="campo-label">
                Produto <span className="obrig">*</span>
              </span>
              <select
                value={paId}
                onChange={(e) => {
                  setPaId(e.target.value)
                  setQuantidades({})
                }}
              >
                <option value="">Selecione...</option>
                {pas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
              {erros.paId && <span className="campo-erro">{erros.paId}</span>}
            </label>
          </div>

          {pa && (
            <div className="pa-gram-grid">
              {pa.gramaturas.map((g) => {
                const emb = embSaldo(g)
                const qtd = Number(quantidades[g]) || 0
                return (
                  <div className="pa-gram-card" key={g}>
                    <span className="pa-gram-nome">{formatarGramatura(g)}</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={quantidades[g] ?? ''}
                      onChange={(e) => setQtd(g, e.target.value)}
                      placeholder="0 pacotes"
                    />
                    {emb ? (
                      <span className={`pa-disp ${qtd > 0 && emb.saldo < qtd ? 'baixo' : 'ok'}`}>
                        Embalagem: {emb.saldo} un
                      </span>
                    ) : (
                      <span className="pa-disp">sem embalagem vinculada</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {erros.itens && <span className="campo-erro">{erros.itens}</span>}

          <div className="pa-calc" style={{ marginTop: 14 }}>
            <div className="pa-calc-item">
              <span className="pa-calc-label">Peso embalado</span>
              <strong className="pa-calc-valor dourado">{g0(pesoEmbaladoG)}</strong>
            </div>
          </div>
        </section>

        {/* ETAPA 2 */}
        <section className="pa-etapa">
          <div className="pa-etapa-titulo">
            <span className="pa-etapa-num">2</span> Café utilizado (mix de lotes)
          </div>

          {pa && pesoEmbaladoG > 0 && (
            <div className="pa-sugestao">
              💡 Sugestão de café cru (perda padrão {perdaPadrao.toLocaleString('pt-BR')}%):{' '}
              <strong>{g0(sugestaoCruG)}</strong>
              <span className="pa-disp"> — apenas uma sugestão; informe abaixo o que foi realmente usado.</span>
            </div>
          )}

          {linhasLote.map((linha, i) => {
            const loteLinha = lotesCru.find((l) => l.id === Number(linha.loteId)) || null
            const saldoLinha = Number(loteLinha?.saldoDisponivel) || 0
            return (
              <div className="pa-lote-row" key={i}>
                <label className="campo">
                  <span className="campo-label">Lote</span>
                  <select value={linha.loteId} onChange={(e) => atualizarLinha(i, 'loteId', e.target.value)}>
                    <option value="">Selecione um lote...</option>
                    {lotesCru.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.codigo} — {l.produtor}
                        {l.variedade ? ` / ${l.variedade}` : ''} ({g0((Number(l.saldoDisponivel) || 0) * 1000)})
                      </option>
                    ))}
                  </select>
                  {loteLinha && (
                    <span className={`pa-disp ${saldoLinha < 0.001 ? 'baixo' : 'ok'}`}>
                      {loteLinha.produtor}
                      {loteLinha.variedade ? ` · ${loteLinha.variedade}` : ''} — Disponível:{' '}
                      {g0(saldoLinha * 1000)}
                    </span>
                  )}
                </label>
                <label className="campo">
                  <span className="campo-label">Gramas utilizadas</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={linha.g}
                    onChange={(e) => atualizarLinha(i, 'g', e.target.value)}
                    placeholder="0 g"
                  />
                </label>
                <button
                  type="button"
                  className="pa-lote-remover"
                  onClick={() => removerLinha(i)}
                  disabled={linhasLote.length === 1}
                  title="Remover lote"
                >
                  ✕
                </button>
              </div>
            )
          })}
          {erros.lotes && <span className="campo-erro">{erros.lotes}</span>}
          <button type="button" className="btn btn-ghost" onClick={adicionarLinha} style={{ marginTop: 6 }}>
            + Adicionar lote
          </button>
          <div className="pa-calc" style={{ marginTop: 14 }}>
            <div className="pa-calc-item">
              <span className="pa-calc-label">Total café cru utilizado</span>
              <strong className="pa-calc-valor">{g0(cafeUsadoG)}</strong>
            </div>
            <div className="pa-calc-item">
              <span className="pa-calc-label">Custo do café cru</span>
              <strong className="pa-calc-valor">{formatarMoeda(calc.custoTotalCru)}</strong>
            </div>
          </div>
        </section>

        {/* ETAPA 3 */}
        <section className="pa-etapa">
          <div className="pa-etapa-titulo">
            <span className="pa-etapa-num">3</span> Resultado da torra / processo
          </div>
          <div className="pa-form-linha">
            <label className="campo">
              <span className="campo-label">Sobra de torrado sem embalar (g)</span>
              <input
                type="number"
                min="0"
                step="1"
                value={sobra}
                onChange={(e) => setSobra(e.target.value)}
                placeholder="0 g"
              />
              {erros.sobra && <span className="campo-erro">{erros.sobra}</span>}
            </label>
          </div>
          <div className="pa-calc" style={{ marginTop: 14 }}>
            <div className="pa-calc-item">
              <span className="pa-calc-label">Cru usado</span>
              <strong className="pa-calc-valor">{g0(cafeUsadoG)}</strong>
            </div>
            <div className="pa-calc-item">
              <span className="pa-calc-label">Embalado</span>
              <strong className="pa-calc-valor">{g0(pesoEmbaladoG)}</strong>
            </div>
            <div className="pa-calc-item">
              <span className="pa-calc-label">Sobra torrada</span>
              <strong className="pa-calc-valor">{g0(sobraG)}</strong>
            </div>
            <div className="pa-calc-item">
              <span className="pa-calc-label">Perda real</span>
              <strong className={`pa-calc-valor ${perdaRealG < -1e-6 ? 'danger' : ''}`}>
                {g0(perdaRealG)} ({perdaRealPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)
              </strong>
            </div>
          </div>

          {/* Comparativo perda real × esperada */}
          {cafeUsadoG > 0 && Number(calc.perda) >= -1e-9 && (
            <div className={`pa-perda-comp ${dentroEsperado ? 'ok' : 'alerta'}`} style={{ marginTop: 12 }}>
              {dentroEsperado ? (
                <>
                  ✅ Dentro do esperado — esperado{' '}
                  {perdaPadrao.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%, real{' '}
                  {perdaRealPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%.
                </>
              ) : (
                <>
                  ⚠️ Perda acima do esperado — esperado{' '}
                  {perdaPadrao.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%, real{' '}
                  {perdaRealPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% (+
                  {g0(excedenteG)} acima do esperado).
                </>
              )}
            </div>
          )}
        </section>

        {/* ETAPA 4 */}
        <section className="pa-etapa">
          <div className="pa-etapa-titulo">
            <span className="pa-etapa-num">4</span> Confirmação e custos
          </div>

          <div className="pa-resumo">
            <div className="pa-resumo-linha">
              <span className="pa-resumo-rot">Produto</span>
              <span className="pa-resumo-val">{pa ? pa.nome : '—'}</span>
            </div>
            <div className="pa-resumo-linha">
              <span className="pa-resumo-rot">Custo total café (MP)</span>
              <span className="pa-resumo-val">{formatarMoeda(calc.custoTotalCru)}</span>
            </div>
            <div className="pa-resumo-linha">
              <span className="pa-resumo-rot">Custo / kg embalado</span>
              <span className="pa-resumo-val">{formatarMoeda(calc.custoKgEmbalado)}</span>
            </div>
          </div>

          {/* Detalhamento por gramatura */}
          <div className="pa-gram-detalhes">
            {calc.itens.map((it) => (
              <div className="pa-gram-box" key={it.gramatura}>
                <div className="pa-gram-box-titulo">
                  Pacotes {formatarGramatura(it.gramatura)} ({it.quantidade} un)
                </div>
                <div className="pa-gram-linha">
                  <span>Café</span>
                  <span>
                    {formatarMoeda(it.custoUnitarioCafe)}/un → {formatarMoeda(it.custoUnitarioCafe * it.quantidade)}
                  </span>
                </div>
                <div className="pa-gram-linha">
                  <span>Embalagem</span>
                  <span>
                    {formatarMoeda(it.custoUnitarioEmbalagem)}/un →{' '}
                    {formatarMoeda(it.custoUnitarioEmbalagem * it.quantidade)}
                  </span>
                </div>
                <div className="pa-gram-linha total">
                  <span>TOTAL</span>
                  <span>
                    {formatarMoeda(it.custoUnitarioTotal)}/un → {formatarMoeda(it.custoTotalGramatura)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="pa-resumo" style={{ marginTop: 8 }}>
            <div className="pa-resumo-linha">
              <span className="pa-resumo-rot">Embalagens baixadas</span>
              <span className="pa-resumo-val">
                {calc.itens.filter((it) => it.embalagemId).length === 0
                  ? '—'
                  : calc.itens
                      .filter((it) => it.embalagemId)
                      .map((it) => `${it.quantidade} un ${it.embNome}`)
                      .join(' + ')}
              </span>
            </div>
            <div className="pa-resumo-linha">
              <span className="pa-resumo-rot">Sobra torrada (custo zero)</span>
              <span className="pa-resumo-val">
                {g0(sobraG)} → {formatarMoeda(0)}
              </span>
            </div>
            <div className="pa-resumo-linha">
              <span className="pa-resumo-rot">Perda real (informação)</span>
              <span className="pa-resumo-val">
                {g0(perdaRealG)} ({perdaRealPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)
              </span>
            </div>
            <div className="pa-resumo-linha pa-resumo-total">
              <span className="pa-resumo-rot">Custo total da produção</span>
              <span className="pa-resumo-val">{formatarMoeda(calc.custoTotalGeral)}</span>
            </div>
          </div>

          <div className="pa-confirmar">
            <button className="btn btn-primary" onClick={confirmar} disabled={!podeConfirmar}>
              Confirmar produção
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
