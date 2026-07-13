import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Topbar from '../../../components/Topbar'
import AbasInsumos from './AbasInsumos'
import { formatarMoeda, formatarData, hojeISO } from '../../../utils/formato'
import { registrarLog, ACOES } from '../../../utils/auditoria'
import { nomeUsuarioAtual } from '../../../utils/permissoes'
import {
  carregarCadastro,
  carregarEntradas,
  registrarEntradaInsumo,
  formatarQuantidade,
} from '../../../utils/insumos'
import '../CafeCru.css'
import './Insumos.css'

const FORM_VAZIO = {
  insumoId: '',
  data: hojeISO(),
  quantidade: '',
  custoUnitario: '',
  fornecedor: '',
  observacao: '',
}

export default function InsumosEntrada() {
  const [insumos, setInsumos] = useState([])
  const [entradas, setEntradas] = useState([])
  const [form, setForm] = useState(FORM_VAZIO)
  const [erros, setErros] = useState({})

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const r = await carregarCadastro()
      if (vivo) setInsumos(r)
    })()
    return () => {
      vivo = false
    }
  }, [])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const r = await carregarEntradas()
      if (vivo) setEntradas(r)
    })()
    return () => {
      vivo = false
    }
  }, [])

  const insumoSel = insumos.find((i) => i.id === Number(form.insumoId)) || null

  const custoTotal = useMemo(() => {
    const q = Number(String(form.quantidade).replace(',', '.')) || 0
    const c = Number(String(form.custoUnitario).replace(',', '.')) || 0
    return q * c
  }, [form.quantidade, form.custoUnitario])

  function atualizarCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  function validar() {
    const e = {}
    if (!form.insumoId) e.insumoId = 'Selecione o insumo.'
    const q = Number(String(form.quantidade).replace(',', '.'))
    if (!form.quantidade || Number.isNaN(q) || q <= 0) e.quantidade = 'Informe a quantidade.'
    const c = Number(String(form.custoUnitario).replace(',', '.'))
    if (!form.custoUnitario || Number.isNaN(c) || c < 0) e.custoUnitario = 'Informe o custo unitário.'
    if (!form.data) e.data = 'Informe a data.'
    setErros(e)
    return Object.keys(e).length === 0
  }

  async function salvar(e) {
    e.preventDefault()
    if (!validar()) return

    await registrarEntradaInsumo({
      insumoId: form.insumoId,
      data: form.data,
      quantidade: form.quantidade,
      custoUnitario: form.custoUnitario,
      fornecedor: form.fornecedor,
      observacao: form.observacao,
    })

    registrarLog(
      nomeUsuarioAtual(),
      'Insumos',
      ACOES.INCLUIU,
      `Entrada de ${formatarQuantidade(form.quantidade, insumoSel?.unidade)} de ${insumoSel?.nome} (${formatarMoeda(custoTotal)})`,
    )

    setEntradas(await carregarEntradas())
    setForm({ ...FORM_VAZIO, data: form.data })
    setErros({})
  }

  const nomePorId = useMemo(() => {
    const mapa = {}
    for (const i of insumos) mapa[i.id] = i
    return mapa
  }, [insumos])

  const entradasOrdenadas = useMemo(
    () => [...entradas].sort((a, b) => (b.data || '').localeCompare(a.data || '') || b.id - a.id),
    [entradas],
  )

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="kx-breadcrumb">
          <Link to="/estoque" className="ec-link">
            Estoque
          </Link>{' '}
          · Insumos · Entrada
        </div>

        <AbasInsumos />

        <h1 className="kx-titulo" style={{ marginBottom: 20 }}>
          Entrada de insumos
        </h1>

        <div className="in-card">
          <h2>Registrar entrada</h2>
          <form onSubmit={salvar} className="in-form">
            <label className="campo">
              <span className="campo-label">
                Insumo <span className="obrig">*</span>
              </span>
              <select
                value={form.insumoId}
                onChange={(e) => atualizarCampo('insumoId', e.target.value)}
              >
                <option value="">Selecione um insumo...</option>
                {insumos.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nome} ({i.unidade})
                  </option>
                ))}
              </select>
              {erros.insumoId && <span className="campo-erro">{erros.insumoId}</span>}
            </label>

            <div className="in-form-linha">
              <label className="campo">
                <span className="campo-label">
                  Data <span className="obrig">*</span>
                </span>
                <input
                  type="date"
                  value={form.data}
                  onChange={(e) => atualizarCampo('data', e.target.value)}
                />
                {erros.data && <span className="campo-erro">{erros.data}</span>}
              </label>
              <label className="campo">
                <span className="campo-label">
                  Quantidade {insumoSel ? `(${insumoSel.unidade})` : ''}{' '}
                  <span className="obrig">*</span>
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.quantidade}
                  onChange={(e) => atualizarCampo('quantidade', e.target.value)}
                  placeholder="0"
                />
                {erros.quantidade && <span className="campo-erro">{erros.quantidade}</span>}
              </label>
            </div>

            <div className="in-form-linha">
              <label className="campo">
                <span className="campo-label">
                  Custo unitário (R$) <span className="obrig">*</span>
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.custoUnitario}
                  onChange={(e) => atualizarCampo('custoUnitario', e.target.value)}
                  placeholder="0,00"
                />
                {erros.custoUnitario && <span className="campo-erro">{erros.custoUnitario}</span>}
              </label>
              <label className="campo">
                <span className="campo-label">Custo total</span>
                <div className="in-calculado">{formatarMoeda(custoTotal)}</div>
              </label>
            </div>

            <div className="in-form-linha">
              <label className="campo">
                <span className="campo-label">Fornecedor</span>
                <input
                  type="text"
                  value={form.fornecedor}
                  onChange={(e) => atualizarCampo('fornecedor', e.target.value)}
                  placeholder="Opcional"
                />
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

            <div className="in-acoes">
              <button type="submit" className="btn btn-primary">
                Registrar entrada
              </button>
            </div>
          </form>
        </div>

        <h2 className="kx-titulo" style={{ fontSize: 18, marginBottom: 14 }}>
          Últimas entradas
        </h2>
        <div className="kx-tabela-wrap">
          <table className="kx-tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th>Insumo</th>
                <th className="kx-num">Quantidade</th>
                <th className="kx-num">Custo unit.</th>
                <th className="kx-num">Custo total</th>
                <th>Fornecedor</th>
              </tr>
            </thead>
            <tbody>
              {entradasOrdenadas.length === 0 && (
                <tr>
                  <td colSpan={6} className="kx-vazio">
                    Nenhuma entrada registrada ainda.
                  </td>
                </tr>
              )}
              {entradasOrdenadas.map((en) => {
                const insumo = nomePorId[en.insumoId]
                return (
                  <tr key={en.id}>
                    <td>{formatarData(en.data)}</td>
                    <td>{insumo?.nome || `#${en.insumoId}`}</td>
                    <td className="kx-num">
                      {formatarQuantidade(en.quantidade, insumo?.unidade)}
                    </td>
                    <td className="kx-num">{formatarMoeda(en.custoUnitario)}</td>
                    <td className="kx-num">{formatarMoeda(en.quantidade * en.custoUnitario)}</td>
                    <td>{en.fornecedor || <span className="cp-muted">—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
