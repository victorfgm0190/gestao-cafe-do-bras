import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Topbar from '../../../components/Topbar'
import AbasTorrado from './AbasTorrado'
import { formatarMoeda, formatarData, formatarKg, hojeISO } from '../../../utils/formato'
import { registrarLog, ACOES } from '../../../utils/auditoria'
import { nomeUsuarioAtual } from '../../../utils/permissoes'
import {
  lotesCruDisponiveis,
  custoMedioCru,
  registrarTorra,
  carregarTorras,
  PERFIS_TORRA,
} from '../../../utils/torrado'
import '../CafeCru.css'
import './Torrado.css'

function formatarPct(n) {
  return `${(Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

const FORM_VAZIO = {
  data: hojeISO(),
  loteId: '',
  pesoCru: '',
  pesoTorrado: '',
  perfil: 'Média',
  observacao: '',
}

export default function TorradoEntrada() {
  const [lotes, setLotes] = useState(lotesCruDisponiveis)
  const [torras, setTorras] = useState(carregarTorras)
  const [form, setForm] = useState(FORM_VAZIO)
  const [erros, setErros] = useState({})

  const custoCru = useMemo(() => custoMedioCru(), [])

  const lote = lotes.find((l) => l.id === Number(form.loteId)) || null
  const saldoLote = Number(lote?.saldoDisponivel) || 0

  const pesoCruNum = Number(String(form.pesoCru).replace(',', '.')) || 0
  const pesoTorradoNum = Number(String(form.pesoTorrado).replace(',', '.')) || 0
  const rendimento = pesoCruNum > 0 ? (pesoTorradoNum / pesoCruNum) * 100 : 0
  const perda = pesoCruNum - pesoTorradoNum
  const custoTorrado = pesoTorradoNum > 0 ? (pesoCruNum * custoCru) / pesoTorradoNum : 0

  function atualizarCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  function validar() {
    const e = {}
    if (!form.loteId) e.loteId = 'Selecione o lote de origem.'
    if (!pesoCruNum || pesoCruNum <= 0) e.pesoCru = 'Informe o peso cru.'
    else if (lote && pesoCruNum > saldoLote)
      e.pesoCru = `Máximo disponível: ${formatarKg(saldoLote)}.`
    if (!pesoTorradoNum || pesoTorradoNum <= 0) e.pesoTorrado = 'Informe o peso torrado.'
    else if (pesoTorradoNum > pesoCruNum)
      e.pesoTorrado = 'O torrado não pode pesar mais que o cru.'
    if (!form.data) e.data = 'Informe a data.'
    setErros(e)
    return Object.keys(e).length === 0
  }

  function salvar(e) {
    e.preventDefault()
    if (!validar()) return

    registrarTorra({
      data: form.data,
      loteId: form.loteId,
      pesoCru: form.pesoCru,
      pesoTorrado: form.pesoTorrado,
      perfil: form.perfil,
      observacao: form.observacao,
    })

    registrarLog(
      nomeUsuarioAtual(),
      'Estoque PP',
      ACOES.INCLUIU,
      `Torra ${formatarData(form.data)}: ${formatarKg(pesoCruNum)} cru → ${formatarKg(pesoTorradoNum)} torrado (${formatarPct(rendimento)})`,
    )

    setLotes(lotesCruDisponiveis())
    setTorras(carregarTorras())
    setForm({ ...FORM_VAZIO, data: form.data })
    setErros({})
  }

  const torrasOrdenadas = useMemo(
    () => [...torras].sort((a, b) => (b.data || '').localeCompare(a.data || '') || b.id - a.id),
    [torras],
  )

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="kx-breadcrumb">
          <Link to="/estoque" className="ec-link">
            Estoque
          </Link>{' '}
          · Café torrado · Registrar torra
        </div>

        <AbasTorrado />

        <h1 className="kx-titulo" style={{ marginBottom: 20 }}>
          Registrar Torra
        </h1>

        <div className="tr-card">
          <h2>Ordem de torra</h2>
          <form onSubmit={salvar} className="tr-form">
            <div className="tr-form-linha">
              <label className="campo">
                <span className="campo-label">
                  Data da torra <span className="obrig">*</span>
                </span>
                <input type="date" value={form.data} onChange={(e) => atualizarCampo('data', e.target.value)} />
                {erros.data && <span className="campo-erro">{erros.data}</span>}
              </label>
              <label className="campo">
                <span className="campo-label">
                  Lote de origem <span className="obrig">*</span>
                </span>
                <select value={form.loteId} onChange={(e) => atualizarCampo('loteId', e.target.value)}>
                  <option value="">Selecione um lote...</option>
                  {lotes.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.codigo} — {l.produtor} ({formatarKg(l.saldoDisponivel)})
                    </option>
                  ))}
                </select>
                {erros.loteId && <span className="campo-erro">{erros.loteId}</span>}
                {lotes.length === 0 && (
                  <span className="campo-erro">Nenhum lote de café cru com saldo disponível.</span>
                )}
              </label>
            </div>

            <div className="tr-form-linha">
              <label className="campo">
                <span className="campo-label">
                  Peso cru utilizado (kg) <span className="obrig">*</span>
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  max={saldoLote || undefined}
                  value={form.pesoCru}
                  onChange={(e) => atualizarCampo('pesoCru', e.target.value)}
                  placeholder="0,00"
                />
                {lote && (
                  <span className="campo-ajuda">Disponível no lote: {formatarKg(saldoLote)}</span>
                )}
                {erros.pesoCru && <span className="campo-erro">{erros.pesoCru}</span>}
              </label>
              <label className="campo">
                <span className="campo-label">
                  Peso torrado obtido (kg) <span className="obrig">*</span>
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.pesoTorrado}
                  onChange={(e) => atualizarCampo('pesoTorrado', e.target.value)}
                  placeholder="0,00"
                />
                {erros.pesoTorrado && <span className="campo-erro">{erros.pesoTorrado}</span>}
              </label>
            </div>

            {/* Painel de cálculo automático */}
            <div className="tr-calc">
              <div className="tr-calc-item">
                <span className="tr-calc-label">Rendimento</span>
                <strong className="tr-calc-valor">{formatarPct(rendimento)}</strong>
              </div>
              <div className="tr-calc-item">
                <span className="tr-calc-label">Perda de peso</span>
                <strong className="tr-calc-valor">{formatarKg(perda > 0 ? perda : 0)}</strong>
              </div>
              <div className="tr-calc-item">
                <span className="tr-calc-label">Custo médio cru</span>
                <strong className="tr-calc-valor">{formatarMoeda(custoCru)}</strong>
              </div>
              <div className="tr-calc-item">
                <span className="tr-calc-label">Custo do torrado / kg</span>
                <strong className="tr-calc-valor dourado">{formatarMoeda(custoTorrado)}</strong>
              </div>
            </div>

            <div className="tr-form-linha">
              <label className="campo">
                <span className="campo-label">Perfil de torra</span>
                <select value={form.perfil} onChange={(e) => atualizarCampo('perfil', e.target.value)}>
                  {PERFIS_TORRA.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span className="campo-label">Observação</span>
                <input
                  type="text"
                  value={form.observacao}
                  onChange={(e) => atualizarCampo('observacao', e.target.value)}
                  placeholder="Opcional"
                />
              </label>
            </div>

            <div className="tr-acoes">
              <button type="submit" className="btn btn-primary" disabled={lotes.length === 0}>
                Registrar torra
              </button>
            </div>
          </form>
        </div>

        {/* Histórico de torras */}
        <h2 className="kx-titulo" style={{ fontSize: 18, marginBottom: 14 }}>
          Histórico de torras
        </h2>
        <div className="kx-tabela-wrap">
          <table className="kx-tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th>Lote origem</th>
                <th className="kx-num">Peso cru</th>
                <th className="kx-num">Peso torrado</th>
                <th className="kx-num">Rendimento</th>
                <th>Perfil</th>
              </tr>
            </thead>
            <tbody>
              {torrasOrdenadas.length === 0 && (
                <tr>
                  <td colSpan={6} className="kx-vazio">
                    Nenhuma torra registrada ainda.
                  </td>
                </tr>
              )}
              {torrasOrdenadas.map((t) => (
                <tr key={t.id}>
                  <td>{formatarData(t.data)}</td>
                  <td>
                    {t.loteCodigo}
                    {t.produtor ? <span className="cp-muted"> · {t.produtor}</span> : null}
                  </td>
                  <td className="kx-num">{formatarKg(t.pesoCru)}</td>
                  <td className="kx-num">{formatarKg(t.pesoTorrado)}</td>
                  <td className="kx-num">{formatarPct(t.rendimento)}</td>
                  <td>{t.perfil}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
