import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Topbar from '../../../components/Topbar'
import AbasPA from './AbasPA'
import { formatarMoeda, formatarKg, hojeISO } from '../../../utils/formato'
import { registrarLog, ACOES } from '../../../utils/auditoria'
import { nomeUsuarioAtual } from '../../../utils/permissoes'
import {
  carregarPA,
  lotesCruDisponiveis,
  calcularOrdem,
  registrarOrdem,
  formatarGramatura,
} from '../../../utils/pa'
import '../CafeCru.css'
import './PA.css'

function kg3(n) {
  return `${(Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`
}

export default function OrdemProducao() {
  const navigate = useNavigate()
  const [pas] = useState(() => carregarPA().filter((p) => p.ativo !== false))
  const [lotesCru, setLotesCru] = useState(lotesCruDisponiveis)

  const [data, setData] = useState(hojeISO())
  const [paId, setPaId] = useState('')
  const [gramatura, setGramatura] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [linhasLote, setLinhasLote] = useState([{ loteId: '', kg: '' }])
  const [sobra, setSobra] = useState('')
  const [erros, setErros] = useState({})

  const pa = pas.find((p) => p.id === Number(paId)) || null

  const calc = useMemo(
    () => calcularOrdem({ paId, gramatura, quantidade, lotes: linhasLote, sobra }),
    [paId, gramatura, quantidade, linhasLote, sobra],
  )

  function atualizarLinha(i, campo, valor) {
    setLinhasLote((linhas) => linhas.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)))
  }
  function adicionarLinha() {
    setLinhasLote((l) => [...l, { loteId: '', kg: '' }])
  }
  function removerLinha(i) {
    setLinhasLote((l) => (l.length > 1 ? l.filter((_, idx) => idx !== i) : l))
  }

  function validar() {
    const e = {}
    if (!paId) e.paId = 'Selecione o produto.'
    if (!gramatura) e.gramatura = 'Selecione a gramatura.'
    const q = Number(quantidade)
    if (!quantidade || Number.isNaN(q) || q <= 0) e.quantidade = 'Informe a quantidade de pacotes.'

    const linhasValidas = linhasLote.filter(
      (l) => l.loteId && (Number(String(l.kg).replace(',', '.')) || 0) > 0,
    )
    if (linhasValidas.length === 0) e.lotes = 'Adicione ao menos um lote com quantidade.'

    const somaPorLote = {}
    for (const l of linhasValidas) {
      const kg = Number(String(l.kg).replace(',', '.')) || 0
      somaPorLote[l.loteId] = (somaPorLote[l.loteId] || 0) + kg
    }
    for (const [loteId, kg] of Object.entries(somaPorLote)) {
      const lote = lotesCru.find((x) => x.id === Number(loteId))
      if (lote && kg > (Number(lote.saldoDisponivel) || 0)) {
        e.lotes = `Lote ${lote.codigo}: máximo ${formatarKg(lote.saldoDisponivel)} disponível.`
      }
    }

    const sobraN = Number(String(sobra).replace(',', '.')) || 0
    if (sobraN < 0) e.sobra = 'Sobra inválida.'
    if (calc.perda < -1e-9) e.sobra = 'Embalado + sobra excedem o café cru utilizado.'

    setErros(e)
    return Object.keys(e).length === 0
  }

  function confirmar() {
    if (!validar()) return

    const ordem = registrarOrdem({
      data,
      paId,
      gramatura,
      quantidade,
      lotes: linhasLote,
      sobra,
    })

    registrarLog(
      nomeUsuarioAtual(),
      'Estoque PA',
      ACOES.INCLUIU,
      `Produção: ${ordem.paNome} ${formatarGramatura(ordem.gramatura)} × ${ordem.quantidade} pacotes (${formatarMoeda(ordem.custoTotal)})`,
    )

    // reset
    setPaId('')
    setGramatura('')
    setQuantidade('')
    setLinhasLote([{ loteId: '', kg: '' }])
    setSobra('')
    setErros({})
    setLotesCru(lotesCruDisponiveis())
    navigate('/estoque/pa/historico')
  }

  const podeConfirmar = paId && gramatura && Number(quantidade) > 0 && calc.totalCru > 0

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
                  setGramatura('')
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
            <label className="campo">
              <span className="campo-label">
                Gramatura <span className="obrig">*</span>
              </span>
              <select
                value={gramatura}
                onChange={(e) => setGramatura(e.target.value)}
                disabled={!pa}
              >
                <option value="">Selecione...</option>
                {(pa?.gramaturas || []).map((g) => (
                  <option key={g} value={g}>
                    {formatarGramatura(g)}
                  </option>
                ))}
              </select>
              {erros.gramatura && <span className="campo-erro">{erros.gramatura}</span>}
            </label>
            <label className="campo">
              <span className="campo-label">
                Pacotes produzidos <span className="obrig">*</span>
              </span>
              <input
                type="number"
                min="0"
                step="1"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                placeholder="0"
              />
              {erros.quantidade && <span className="campo-erro">{erros.quantidade}</span>}
            </label>
          </div>
          <div className="pa-calc" style={{ marginTop: 14 }}>
            <div className="pa-calc-item">
              <span className="pa-calc-label">Total embalado</span>
              <strong className="pa-calc-valor dourado">{kg3(calc.embaladoKg)}</strong>
            </div>
          </div>
        </section>

        {/* ETAPA 2 */}
        <section className="pa-etapa">
          <div className="pa-etapa-titulo">
            <span className="pa-etapa-num">2</span> Café utilizado (mix de lotes)
          </div>
          {linhasLote.map((linha, i) => (
            <div className="pa-lote-row" key={i}>
              <label className="campo">
                <span className="campo-label">Lote</span>
                <select value={linha.loteId} onChange={(e) => atualizarLinha(i, 'loteId', e.target.value)}>
                  <option value="">Selecione um lote...</option>
                  {lotesCru.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.codigo} — {l.produtor} ({formatarKg(l.saldoDisponivel)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span className="campo-label">Kg utilizados</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={linha.kg}
                  onChange={(e) => atualizarLinha(i, 'kg', e.target.value)}
                  placeholder="0,00"
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
          ))}
          {erros.lotes && <span className="campo-erro">{erros.lotes}</span>}
          <button type="button" className="btn btn-ghost" onClick={adicionarLinha} style={{ marginTop: 6 }}>
            + Adicionar lote
          </button>
          <div className="pa-calc" style={{ marginTop: 14 }}>
            <div className="pa-calc-item">
              <span className="pa-calc-label">Total café cru utilizado</span>
              <strong className="pa-calc-valor">{formatarKg(calc.totalCru)}</strong>
            </div>
            <div className="pa-calc-item">
              <span className="pa-calc-label">Custo do café cru</span>
              <strong className="pa-calc-valor">{formatarMoeda(calc.custoCruTotal)}</strong>
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
              <span className="campo-label">Sobra de torrado sem embalar (kg)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={sobra}
                onChange={(e) => setSobra(e.target.value)}
                placeholder="0,00"
              />
              {erros.sobra && <span className="campo-erro">{erros.sobra}</span>}
            </label>
          </div>
          <div className="pa-calc" style={{ marginTop: 14 }}>
            <div className="pa-calc-item">
              <span className="pa-calc-label">Cru usado</span>
              <strong className="pa-calc-valor">{formatarKg(calc.totalCru)}</strong>
            </div>
            <div className="pa-calc-item">
              <span className="pa-calc-label">Embalado</span>
              <strong className="pa-calc-valor">{formatarKg(calc.embaladoKg)}</strong>
            </div>
            <div className="pa-calc-item">
              <span className="pa-calc-label">Sobra torrada</span>
              <strong className="pa-calc-valor">{formatarKg(calc.sobra)}</strong>
            </div>
            <div className="pa-calc-item">
              <span className="pa-calc-label">Perda</span>
              <strong className={`pa-calc-valor ${calc.perda < -1e-9 ? 'danger' : ''}`}>
                {formatarKg(calc.perda)}
              </strong>
            </div>
          </div>
        </section>

        {/* ETAPA 4 */}
        <section className="pa-etapa">
          <div className="pa-etapa-titulo">
            <span className="pa-etapa-num">4</span> Confirmação e custos
          </div>

          <div className="pa-resumo">
            <div className="pa-resumo-linha">
              <span className="pa-resumo-rot">Produto</span>
              <span className="pa-resumo-val">
                {pa ? `${pa.nome} ${formatarGramatura(calc.gramatura)} × ${calc.quantidade} pacotes` : '—'}
              </span>
            </div>

            <div className="pa-resumo-linha">
              <span className="pa-resumo-rot">Café cru consumido</span>
              <span className="pa-resumo-val">
                {calc.lotes.length === 0 ? (
                  '—'
                ) : (
                  <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                    {calc.lotes.map((l) => (
                      <span key={l.loteId} className="pa-lote-item">
                        {l.loteCodigo}: {formatarKg(l.kg)} × {formatarMoeda(l.custoPorKg)} ={' '}
                        {formatarMoeda(l.custoTotalLote)}
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </div>

            <div className="pa-resumo-linha">
              <span className="pa-resumo-rot">Custo da matéria prima (café)</span>
              <span className="pa-resumo-val">{formatarMoeda(calc.custoMateriaPrima)}</span>
            </div>
            <div className="pa-resumo-linha">
              <span className="pa-resumo-rot">
                Embalagens baixadas{' '}
                {calc.embalagemId ? `(${calc.quantidade} un)` : '(sem embalagem vinculada)'}
              </span>
              <span className="pa-resumo-val">{formatarMoeda(calc.custoEmbalagens)}</span>
            </div>
            <div className="pa-resumo-linha">
              <span className="pa-resumo-rot">Sobra torrada (vai ao estoque de torrado)</span>
              <span className="pa-resumo-val">{formatarKg(calc.sobra)}</span>
            </div>
            <div className="pa-resumo-linha">
              <span className="pa-resumo-rot">Perda</span>
              <span className="pa-resumo-val">{formatarKg(calc.perda)}</span>
            </div>
            <div className="pa-resumo-linha pa-resumo-total">
              <span className="pa-resumo-rot">Custo por pacote</span>
              <span className="pa-resumo-val">{formatarMoeda(calc.custoUnitario)}</span>
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
