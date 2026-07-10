import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Topbar from '../../../components/Topbar'
import AbasTorrado from './AbasTorrado'
import { formatarMoeda, formatarData, formatarKg, hojeISO } from '../../../utils/formato'
import { registrarLog, ACOES } from '../../../utils/auditoria'
import { nomeUsuarioAtual } from '../../../utils/permissoes'
import { TIPOS_MOV, LISTA_TIPOS } from '../../../utils/kardex'
import { carregarKardexTorrado, carregarEstoqueTorrado, registrarMovimentacaoTorrado } from '../../../utils/torrado'
import '../CafeCru.css'
import './Torrado.css'

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

function quantidadeTexto(q) {
  const n = Number(q) || 0
  const sinal = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sinal} ${formatarKg(Math.abs(n))}`
}

const MOV_VAZIA = {
  tipo: TIPOS_MOV.SAIDA,
  data: hojeISO(),
  quantidade: '',
  custoUnitario: '',
  descricao: '',
}

export default function TorradoKardex() {
  const [movs, setMovs] = useState(carregarKardexTorrado)
  const [resumo, setResumo] = useState(carregarEstoqueTorrado)

  const [dataInicial, setDataInicial] = useState('')
  const [dataFinal, setDataFinal] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todos')

  const [modalAberto, setModalAberto] = useState(false)
  const [form, setForm] = useState(MOV_VAZIA)
  const [erros, setErros] = useState({})

  const filtradas = useMemo(() => {
    return movs
      .filter((m) => {
        if (dataInicial && m.data < dataInicial) return false
        if (dataFinal && m.data > dataFinal) return false
        if (filtroTipo !== 'todos' && m.tipo !== filtroTipo) return false
        return true
      })
      .sort((a, b) => (a.data || '').localeCompare(b.data || '') || (a.id || 0) - (b.id || 0))
  }, [movs, dataInicial, dataFinal, filtroTipo])

  const totais = useMemo(() => {
    let entradas = 0
    let saidas = 0
    for (const m of filtradas) {
      const q = Number(m.quantidade) || 0
      if (q > 0) entradas += q
      else saidas += Math.abs(q)
    }
    return {
      entradas,
      saidas,
      saldoAtual: Number(resumo.saldoAtual) || 0,
      custoMedio: Number(resumo.custoMedio) || 0,
    }
  }, [filtradas, resumo])

  function limparFiltros() {
    setDataInicial('')
    setDataFinal('')
    setFiltroTipo('todos')
  }

  function exportarCSV() {
    const cabecalho = [
      'Data',
      'Tipo',
      'Descrição',
      'Quantidade (kg)',
      'Custo unitário (R$)',
      'Custo total (R$)',
      'Saldo acumulado (kg)',
      'Custo médio (R$)',
    ]
    const linhas = filtradas.map((m) => [
      formatarData(m.data),
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
    a.download = `kardex-cafe-torrado-${hojeISO()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    registrarLog(nomeUsuarioAtual(), 'Estoque PP', ACOES.EXPORTOU, 'Exportou o kardex do café torrado (CSV)')
  }

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
    const q = Number(String(form.quantidade).replace(',', '.'))
    if (!form.quantidade || Number.isNaN(q) || q <= 0) e.quantidade = 'Informe a quantidade (kg).'
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

    registrarMovimentacaoTorrado({
      tipo,
      sentido,
      data: form.data,
      descricao: form.descricao.trim(),
      quantidade: form.quantidade,
      custoUnitario: ehAjustePositivo ? form.custoUnitario : '',
    })

    registrarLog(
      nomeUsuarioAtual(),
      'Estoque PP',
      tipo === TIPOS_MOV.PERDA ? ACOES.ALTEROU : ACOES.AJUSTE_ESTOQUE,
      `Kardex torrado: ${form.tipo} de ${formatarKg(Number(String(form.quantidade).replace(',', '.')))} — ${form.descricao.trim()}`,
    )

    setMovs(carregarKardexTorrado())
    setResumo(carregarEstoqueTorrado())
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
          · Café torrado · Kardex
        </div>

        <AbasTorrado />

        <div className="kx-cabecalho">
          <h1 className="kx-titulo">Kardex do café torrado</h1>
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
                  <td colSpan={8} className="kx-vazio">
                    Nenhuma movimentação encontrada com os filtros atuais.
                  </td>
                </tr>
              )}
              {filtradas.map((m) => (
                <tr key={m.id}>
                  <td>{formatarData(m.data)}</td>
                  <td>
                    <span className={classeBadge(m.tipo)}>{m.tipo}</span>
                  </td>
                  <td className="kx-desc">{m.descricao}</td>
                  <td className={`kx-num ${Number(m.quantidade) < 0 ? 'kx-sai' : 'kx-entra'}`}>
                    {quantidadeTexto(m.quantidade)}
                  </td>
                  <td className="kx-num">{formatarMoeda(m.custoUnitario)}</td>
                  <td className="kx-num">{formatarMoeda(m.custoTotal)}</td>
                  <td className="kx-num">{formatarKg(m.saldoAcumulado)}</td>
                  <td className="kx-num">{formatarMoeda(m.custoMedio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="kx-totais">
          <div className="kx-total entra">
            <span className="kx-total-label">Total entradas</span>
            <strong className="kx-total-valor">{formatarKg(totais.entradas)}</strong>
          </div>
          <div className="kx-total sai">
            <span className="kx-total-label">Total saídas</span>
            <strong className="kx-total-valor">{formatarKg(totais.saidas)}</strong>
          </div>
          <div className="kx-total">
            <span className="kx-total-label">Saldo atual</span>
            <strong className="kx-total-valor">{formatarKg(totais.saldoAtual)}</strong>
          </div>
          <div className="kx-total">
            <span className="kx-total-label">Custo médio atual</span>
            <strong className="kx-total-valor">{formatarMoeda(totais.custoMedio)}</strong>
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
                    Quantidade (kg) <span className="obrig">*</span>
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.quantidade}
                    onChange={(e) => atualizarCampo('quantidade', e.target.value)}
                    placeholder="0,00"
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
                  placeholder="Ex.: Ajuste de inventário / perda no manuseio"
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
