import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Topbar from '../../../components/Topbar'
import AbasInsumos from './AbasInsumos'
import { formatarMoeda, formatarData, hojeISO } from '../../../utils/formato'
import { registrarLog, ACOES } from '../../../utils/auditoria'
import { nomeUsuarioAtual } from '../../../utils/permissoes'
import { TIPOS_MOV, LISTA_TIPOS } from '../../../utils/kardex'
import {
  carregarCadastro,
  carregarKardex,
  registrarMovimentacaoInsumo,
  formatarQuantidade,
} from '../../../utils/insumos'
import '../CafeCru.css'
import './Insumos.css'

function classeBadge(tipo) {
  switch (tipo) {
    case TIPOS_MOV.ENTRADA:
      return 'badge badge-entrada'
    case TIPOS_MOV.SAIDA:
      return 'badge badge-saida'
    case TIPOS_MOV.PERDA:
      return 'badge badge-perda'
    default:
      return 'badge badge-ajuste'
  }
}

function numeroBR(n) {
  return (Number(n) || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const MOV_VAZIA = {
  insumoId: '',
  tipo: TIPOS_MOV.SAIDA,
  data: hojeISO(),
  quantidade: '',
  custoUnitario: '',
  descricao: '',
}

export default function InsumosKardex() {
  const insumos = useMemo(() => carregarCadastro(), [])
  const [movs, setMovs] = useState(carregarKardex)

  const [filtroInsumo, setFiltroInsumo] = useState('todos')
  const [dataInicial, setDataInicial] = useState('')
  const [dataFinal, setDataFinal] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todos')

  const [modalAberto, setModalAberto] = useState(false)
  const [form, setForm] = useState(MOV_VAZIA)
  const [erros, setErros] = useState({})

  const insumoPorId = useMemo(() => {
    const mapa = {}
    for (const i of insumos) mapa[i.id] = i
    return mapa
  }, [insumos])

  const filtradas = useMemo(() => {
    return movs
      .filter((m) => {
        if (filtroInsumo !== 'todos' && m.insumoId !== Number(filtroInsumo)) return false
        if (dataInicial && m.data < dataInicial) return false
        if (dataFinal && m.data > dataFinal) return false
        if (filtroTipo !== 'todos' && m.tipo !== filtroTipo) return false
        return true
      })
      .sort(
        (a, b) =>
          (a.data || '').localeCompare(b.data || '') || (a.id || 0) - (b.id || 0),
      )
  }, [movs, filtroInsumo, dataInicial, dataFinal, filtroTipo])

  const totais = useMemo(() => {
    let entradas = 0
    let saidas = 0
    for (const m of filtradas) {
      const q = Number(m.quantidade) || 0
      if (q > 0) entradas += q
      else saidas += Math.abs(q)
    }
    return { entradas, saidas }
  }, [filtradas])

  function unidadeDe(m) {
    return insumoPorId[m.insumoId]?.unidade || ''
  }

  function limparFiltros() {
    setFiltroInsumo('todos')
    setDataInicial('')
    setDataFinal('')
    setFiltroTipo('todos')
  }

  function exportarCSV() {
    const cabecalho = [
      'Data',
      'Insumo',
      'Tipo',
      'Descrição',
      'Quantidade',
      'Custo unitário (R$)',
      'Custo total (R$)',
      'Saldo acumulado',
      'Custo médio (R$)',
    ]
    const linhas = filtradas.map((m) => [
      formatarData(m.data),
      insumoPorId[m.insumoId]?.nome || `#${m.insumoId}`,
      m.tipo,
      m.descricao,
      numeroBR(m.quantidade),
      numeroBR(m.custoUnitario),
      numeroBR(m.custoTotal),
      numeroBR(m.saldoAcumulado),
      numeroBR(m.custoMedio),
    ])
    const csv = [cabecalho, ...linhas]
      .map((linha) => linha.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n')

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kardex-insumos-${hojeISO()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    registrarLog(nomeUsuarioAtual(), 'Insumos', ACOES.EXPORTOU, 'Exportou o kardex de insumos (CSV)')
  }

  // ---- Modal de movimentação ----
  function abrirModal() {
    setForm(MOV_VAZIA)
    setErros({})
    setModalAberto(true)
  }

  function atualizarCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  const ehAjustePositivo = form.tipo === 'Ajuste (+)'

  function validar() {
    const e = {}
    if (!form.insumoId) e.insumoId = 'Selecione o insumo.'
    const q = Number(String(form.quantidade).replace(',', '.'))
    if (!form.quantidade || Number.isNaN(q) || q <= 0) e.quantidade = 'Informe a quantidade.'
    if (!form.data) e.data = 'Informe a data.'
    if (!form.descricao.trim()) e.descricao = 'Descreva a movimentação.'
    setErros(e)
    return Object.keys(e).length === 0
  }

  function salvarMov(e) {
    e.preventDefault()
    if (!validar()) return

    let tipo = form.tipo
    let sentido
    if (form.tipo === 'Ajuste (+)') {
      tipo = TIPOS_MOV.AJUSTE
      sentido = 'positivo'
    } else if (form.tipo === 'Ajuste (−)') {
      tipo = TIPOS_MOV.AJUSTE
      sentido = 'negativo'
    }

    registrarMovimentacaoInsumo({
      insumoId: form.insumoId,
      tipo,
      sentido,
      data: form.data,
      descricao: form.descricao.trim(),
      quantidade: form.quantidade,
      custoUnitario: ehAjustePositivo ? form.custoUnitario : '',
    })

    const insumo = insumoPorId[Number(form.insumoId)]
    registrarLog(
      nomeUsuarioAtual(),
      'Insumos',
      tipo === TIPOS_MOV.PERDA ? ACOES.ALTEROU : ACOES.AJUSTE_ESTOQUE,
      `Kardex insumo: ${form.tipo} de ${formatarQuantidade(form.quantidade, insumo?.unidade)} — ${insumo?.nome || ''}`,
    )

    setMovs(carregarKardex())
    setModalAberto(false)
  }

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="kx-breadcrumb">
          <Link to="/estoque" className="ec-link">
            Estoque
          </Link>{' '}
          · Insumos · Kardex
        </div>

        <AbasInsumos />

        <div className="kx-cabecalho">
          <h1 className="kx-titulo">Kardex de insumos</h1>
          <div className="kx-acoes-topo">
            <button className="btn btn-ghost" onClick={abrirModal}>
              + Movimentação
            </button>
            <button className="btn btn-secondary" onClick={exportarCSV} disabled={filtradas.length === 0}>
              ⬇ Exportar CSV
            </button>
          </div>
        </div>

        <div className="kx-filtros">
          <div className="kx-filtro">
            <span className="kx-filtro-label">Insumo</span>
            <select value={filtroInsumo} onChange={(e) => setFiltroInsumo(e.target.value)}>
              <option value="todos">Todos</option>
              {insumos.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="kx-filtro">
            <span className="kx-filtro-label">Data inicial</span>
            <input type="date" value={dataInicial} onChange={(e) => setDataInicial(e.target.value)} />
          </div>
          <div className="kx-filtro">
            <span className="kx-filtro-label">Data final</span>
            <input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} />
          </div>
          <div className="kx-filtro">
            <span className="kx-filtro-label">Tipo</span>
            <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
              <option value="todos">Todos</option>
              {LISTA_TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <button className="kx-limpar" onClick={limparFiltros}>
            Limpar filtros
          </button>
        </div>

        <div className="kx-tabela-wrap">
          <table className="kx-tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th>Insumo</th>
                <th>Tipo</th>
                <th>Descrição</th>
                <th className="kx-num">Quantidade</th>
                <th className="kx-num">Custo unit.</th>
                <th className="kx-num">Custo total</th>
                <th className="kx-num">Saldo</th>
                <th className="kx-num">Custo médio</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={9} className="kx-vazio">
                    Nenhuma movimentação encontrada com os filtros atuais.
                  </td>
                </tr>
              )}
              {filtradas.map((m) => {
                const un = unidadeDe(m)
                const q = Number(m.quantidade) || 0
                const sinal = q > 0 ? '+' : q < 0 ? '−' : ''
                return (
                  <tr key={m.id}>
                    <td>{formatarData(m.data)}</td>
                    <td>{insumoPorId[m.insumoId]?.nome || `#${m.insumoId}`}</td>
                    <td>
                      <span className={classeBadge(m.tipo)}>{m.tipo}</span>
                    </td>
                    <td className="kx-desc">{m.descricao}</td>
                    <td className={`kx-num ${q < 0 ? 'kx-sai' : 'kx-entra'}`}>
                      {sinal} {formatarQuantidade(Math.abs(q), un)}
                    </td>
                    <td className="kx-num">{formatarMoeda(m.custoUnitario)}</td>
                    <td className="kx-num">{formatarMoeda(m.custoTotal)}</td>
                    <td className="kx-num">{formatarQuantidade(m.saldoAcumulado, un)}</td>
                    <td className="kx-num">{formatarMoeda(m.custoMedio)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="kx-totais">
          <div className="kx-total entra">
            <span className="kx-total-label">Total entradas</span>
            <strong className="kx-total-valor">{numeroBR(totais.entradas)}</strong>
          </div>
          <div className="kx-total sai">
            <span className="kx-total-label">Total saídas</span>
            <strong className="kx-total-valor">{numeroBR(totais.saidas)}</strong>
          </div>
          <div className="kx-total">
            <span className="kx-total-label">Movimentações</span>
            <strong className="kx-total-valor">{filtradas.length}</strong>
          </div>
        </div>
      </main>

      {modalAberto && (
        <div className="kx-overlay" onMouseDown={() => setModalAberto(false)}>
          <div className="kx-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="kx-modal-topo">
              <h2>Nova movimentação</h2>
              <button className="kx-fechar" onClick={() => setModalAberto(false)} aria-label="Fechar">
                ✕
              </button>
            </div>

            <form onSubmit={salvarMov} className="kx-form">
              <label className="campo">
                <span className="campo-label">
                  Insumo <span className="obrig">*</span>
                </span>
                <select value={form.insumoId} onChange={(e) => atualizarCampo('insumoId', e.target.value)}>
                  <option value="">Selecione...</option>
                  {insumos.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nome} ({i.unidade})
                    </option>
                  ))}
                </select>
                {erros.insumoId && <span className="campo-erro">{erros.insumoId}</span>}
              </label>

              <div className="kx-form-linha">
                <label className="campo">
                  <span className="campo-label">Tipo</span>
                  <select value={form.tipo} onChange={(e) => atualizarCampo('tipo', e.target.value)}>
                    <option value={TIPOS_MOV.SAIDA}>Saída</option>
                    <option value={TIPOS_MOV.PERDA}>Perda</option>
                    <option value="Ajuste (+)">Ajuste (+)</option>
                    <option value="Ajuste (−)">Ajuste (−)</option>
                  </select>
                </label>
                <label className="campo">
                  <span className="campo-label">
                    Data <span className="obrig">*</span>
                  </span>
                  <input type="date" value={form.data} onChange={(e) => atualizarCampo('data', e.target.value)} />
                  {erros.data && <span className="campo-erro">{erros.data}</span>}
                </label>
              </div>

              <div className="kx-form-linha">
                <label className="campo">
                  <span className="campo-label">
                    Quantidade <span className="obrig">*</span>
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
                {ehAjustePositivo && (
                  <label className="campo">
                    <span className="campo-label">Custo unitário (R$)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.custoUnitario}
                      onChange={(e) => atualizarCampo('custoUnitario', e.target.value)}
                      placeholder="Custo médio atual se vazio"
                    />
                  </label>
                )}
              </div>

              <label className="campo">
                <span className="campo-label">
                  Descrição <span className="obrig">*</span>
                </span>
                <input
                  type="text"
                  value={form.descricao}
                  onChange={(e) => atualizarCampo('descricao', e.target.value)}
                  placeholder="Ex.: Consumo na embalagem — OP 2026-014"
                />
                {erros.descricao && <span className="campo-erro">{erros.descricao}</span>}
              </label>

              <div className="kx-form-acoes">
                <button type="button" className="btn btn-ghost" onClick={() => setModalAberto(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Registrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
