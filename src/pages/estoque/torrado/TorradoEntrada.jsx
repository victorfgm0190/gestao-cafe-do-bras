import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Topbar from '../../../components/Topbar'
import AbasTorrado from './AbasTorrado'
import { formatarMoeda, formatarData, formatarKg, hojeISO } from '../../../utils/formato'
import { registrarLog, ACOES } from '../../../utils/auditoria'
import { nomeUsuarioAtual } from '../../../utils/permissoes'
import {
  lotesCruDisponiveis,
  loteCruPorId,
  registrarTorra,
  estornarTorra,
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
  const [lotes, setLotes] = useState([])
  const [torras, setTorras] = useState(carregarTorras)

  useEffect(() => {
    ;(async () => setLotes(await lotesCruDisponiveis()))()
  }, [])
  const [form, setForm] = useState(FORM_VAZIO)
  const [erros, setErros] = useState({})

  // Estado do modal de edição
  const [editId, setEditId] = useState(null)
  const [formEdit, setFormEdit] = useState(FORM_VAZIO)
  const [errosEdit, setErrosEdit] = useState({})

  const lote = lotes.find((l) => l.id === Number(form.loteId)) || null
  const saldoLote = Number(lote?.saldoDisponivel) || 0
  // Custo do lote selecionado (não o custo médio global do estoque de cru).
  const custoCru = Number(lote?.custoPorKg) || 0

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

  async function salvar(e) {
    e.preventDefault()
    if (!validar()) return

    await registrarTorra({
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

    setLotes(await lotesCruDisponiveis())
    setTorras(carregarTorras())
    setForm({ ...FORM_VAZIO, data: form.data })
    setErros({})
  }

  // ---- Excluir (estorno completo) ----
  async function excluir(torra) {
    if (
      window.confirm(
        'Tem certeza? Esta ação vai estornar todas as movimentações geradas por esta torra.',
      )
    ) {
      await estornarTorra(torra.id)
      registrarLog(
        nomeUsuarioAtual(),
        'Estoque PP',
        ACOES.EXCLUIU,
        `Estornou a torra ${formatarData(torra.data)} — ${torra.loteCodigo} (${formatarKg(torra.pesoTorrado)} torrado)`,
      )
      setLotes(await lotesCruDisponiveis())
      setTorras(carregarTorras())
    }
  }

  // ---- Editar ----
  // Lotes do select de edição: disponíveis + o lote original (mesmo sem saldo).
  const [lotesEdicao, setLotesEdicao] = useState([])
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const base = await lotesCruDisponiveis()
      const torra = editId != null ? torras.find((t) => t.id === editId) : null
      let resultado = base
      if (torra && !base.some((l) => l.id === Number(torra.loteId))) {
        const orig = await loteCruPorId(torra.loteId)
        if (orig) resultado = [...base, orig]
      }
      if (vivo) setLotesEdicao(resultado)
    })()
    return () => {
      vivo = false
    }
  }, [editId, torras])

  const torraEditando = editId != null ? torras.find((t) => t.id === editId) : null
  const loteEdit = lotesEdicao.find((l) => l.id === Number(formEdit.loteId)) || null
  const saldoLoteEdit = Number(loteEdit?.saldoDisponivel) || 0
  const custoLoteEdit = Number(loteEdit?.custoPorKg) || 0
  // Ao editar mantendo o mesmo lote, o peso cru original volta a ficar disponível.
  const maxCruEdit =
    saldoLoteEdit +
    (torraEditando && Number(loteEdit?.id) === Number(torraEditando.loteId)
      ? Number(torraEditando.pesoCru) || 0
      : 0)
  const pesoCruEditNum = Number(String(formEdit.pesoCru).replace(',', '.')) || 0
  const pesoTorradoEditNum = Number(String(formEdit.pesoTorrado).replace(',', '.')) || 0
  const rendimentoEdit = pesoCruEditNum > 0 ? (pesoTorradoEditNum / pesoCruEditNum) * 100 : 0
  const custoTorradoEdit =
    pesoTorradoEditNum > 0 ? (pesoCruEditNum * custoLoteEdit) / pesoTorradoEditNum : 0

  function abrirEdicao(torra) {
    setEditId(torra.id)
    setFormEdit({
      data: torra.data,
      loteId: String(torra.loteId),
      pesoCru: String(torra.pesoCru),
      pesoTorrado: String(torra.pesoTorrado),
      perfil: torra.perfil || 'Média',
      observacao: torra.observacao || '',
    })
    setErrosEdit({})
  }

  function atualizarCampoEdit(campo, valor) {
    setFormEdit((f) => ({ ...f, [campo]: valor }))
  }

  function validarEdit() {
    const e = {}
    if (!formEdit.loteId) e.loteId = 'Selecione o lote de origem.'
    if (!pesoCruEditNum || pesoCruEditNum <= 0) e.pesoCru = 'Informe o peso cru.'
    else if (loteEdit && pesoCruEditNum > maxCruEdit)
      e.pesoCru = `Máximo disponível: ${formatarKg(maxCruEdit)}.`
    if (!pesoTorradoEditNum || pesoTorradoEditNum <= 0) e.pesoTorrado = 'Informe o peso torrado.'
    else if (pesoTorradoEditNum > pesoCruEditNum)
      e.pesoTorrado = 'O torrado não pode pesar mais que o cru.'
    if (!formEdit.data) e.data = 'Informe a data.'
    setErrosEdit(e)
    return Object.keys(e).length === 0
  }

  async function salvarEdicao(e) {
    e.preventDefault()
    if (!validarEdit()) return

    // Estorna a torra antiga e registra a nova corrigida.
    await estornarTorra(editId)
    await registrarTorra({
      data: formEdit.data,
      loteId: formEdit.loteId,
      pesoCru: formEdit.pesoCru,
      pesoTorrado: formEdit.pesoTorrado,
      perfil: formEdit.perfil,
      observacao: formEdit.observacao,
    })

    registrarLog(
      nomeUsuarioAtual(),
      'Estoque PP',
      ACOES.ALTEROU,
      `Editou a torra ${formatarData(formEdit.data)}: ${formatarKg(pesoCruEditNum)} cru → ${formatarKg(pesoTorradoEditNum)} torrado (${formatarPct(rendimentoEdit)})`,
    )

    setLotes(await lotesCruDisponiveis())
    setTorras(carregarTorras())
    setEditId(null)
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
                <span className="tr-calc-label">Custo do lote / kg</span>
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
                <th className="kx-num">Ações</th>
              </tr>
            </thead>
            <tbody>
              {torrasOrdenadas.length === 0 && (
                <tr>
                  <td colSpan={7} className="kx-vazio">
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
                  <td className="kx-num">
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button className="kx-limpar" onClick={() => abrirEdicao(t)}>
                        ✎ Editar
                      </button>
                      <button className="kx-limpar" onClick={() => excluir(t)}>
                        🗑 Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modal de edição de torra */}
      {editId != null && (
        <div className="kx-overlay" onMouseDown={() => setEditId(null)}>
          <div className="kx-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="kx-modal-topo">
              <h2>Editar torra</h2>
              <button className="kx-fechar" onClick={() => setEditId(null)} aria-label="Fechar">
                ✕
              </button>
            </div>

            <form onSubmit={salvarEdicao} className="kx-form">
              <div className="kx-form-linha">
                <label className="campo">
                  <span className="campo-label">
                    Data da torra <span className="obrig">*</span>
                  </span>
                  <input
                    type="date"
                    value={formEdit.data}
                    onChange={(e) => atualizarCampoEdit('data', e.target.value)}
                  />
                  {errosEdit.data && <span className="campo-erro">{errosEdit.data}</span>}
                </label>
                <label className="campo">
                  <span className="campo-label">
                    Lote de origem <span className="obrig">*</span>
                  </span>
                  <select value={formEdit.loteId} onChange={(e) => atualizarCampoEdit('loteId', e.target.value)}>
                    <option value="">Selecione um lote...</option>
                    {lotesEdicao.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.codigo} — {l.produtor} ({formatarKg(l.saldoDisponivel)})
                      </option>
                    ))}
                  </select>
                  {errosEdit.loteId && <span className="campo-erro">{errosEdit.loteId}</span>}
                </label>
              </div>

              <div className="kx-form-linha">
                <label className="campo">
                  <span className="campo-label">
                    Peso cru (kg) <span className="obrig">*</span>
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formEdit.pesoCru}
                    onChange={(e) => atualizarCampoEdit('pesoCru', e.target.value)}
                    placeholder="0,00"
                  />
                  {loteEdit && (
                    <span className="campo-ajuda">Máximo disponível: {formatarKg(maxCruEdit)}</span>
                  )}
                  {errosEdit.pesoCru && <span className="campo-erro">{errosEdit.pesoCru}</span>}
                </label>
                <label className="campo">
                  <span className="campo-label">
                    Peso torrado (kg) <span className="obrig">*</span>
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formEdit.pesoTorrado}
                    onChange={(e) => atualizarCampoEdit('pesoTorrado', e.target.value)}
                    placeholder="0,00"
                  />
                  {errosEdit.pesoTorrado && <span className="campo-erro">{errosEdit.pesoTorrado}</span>}
                </label>
              </div>

              <div className="tr-calc">
                <div className="tr-calc-item">
                  <span className="tr-calc-label">Rendimento</span>
                  <strong className="tr-calc-valor">{formatarPct(rendimentoEdit)}</strong>
                </div>
                <div className="tr-calc-item">
                  <span className="tr-calc-label">Custo do lote / kg</span>
                  <strong className="tr-calc-valor">{formatarMoeda(custoLoteEdit)}</strong>
                </div>
                <div className="tr-calc-item">
                  <span className="tr-calc-label">Custo do torrado / kg</span>
                  <strong className="tr-calc-valor dourado">{formatarMoeda(custoTorradoEdit)}</strong>
                </div>
              </div>

              <div className="kx-form-linha">
                <label className="campo">
                  <span className="campo-label">Perfil de torra</span>
                  <select value={formEdit.perfil} onChange={(e) => atualizarCampoEdit('perfil', e.target.value)}>
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
                    value={formEdit.observacao}
                    onChange={(e) => atualizarCampoEdit('observacao', e.target.value)}
                    placeholder="Opcional"
                  />
                </label>
              </div>

              <div className="kx-form-acoes">
                <button type="button" className="btn btn-ghost" onClick={() => setEditId(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Salvar alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
