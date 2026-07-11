import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Topbar from '../../components/Topbar'
import AbasCafeCru from './AbasCafeCru'
import { formatarMoeda, formatarData, formatarKg, hojeISO } from '../../utils/formato'
import { registrarLog, ACOES } from '../../utils/auditoria'
import { nomeUsuarioAtual } from '../../utils/permissoes'
import {
  carregarKardex,
  carregarEstoqueResumo,
  garantirKardexInicial,
  registrarMovimentacao,
  TIPOS_MOV,
  LISTA_TIPOS,
} from '../../utils/kardex'
import { editarEntradaCafeCru } from '../../utils/cascata'
import RelatorioImpacto from '../../components/RelatorioImpacto'
import './CafeCru.css'

// Semeia o kardex a partir dos lotes existentes na primeira visita.
garantirKardexInicial()

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

// Número no padrão brasileiro com 2 casas (para o CSV)
function numeroBR(n) {
  return (Number(n) || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// Quantidade com sinal para exibição na tabela
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

export default function KardexCafeCru() {
  const [movs, setMovs] = useState(carregarKardex)
  const [resumo, setResumo] = useState(carregarEstoqueResumo)

  const [dataInicial, setDataInicial] = useState('')
  const [dataFinal, setDataFinal] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroGrupo, setFiltroGrupo] = useState('todos')

  const [modalAberto, setModalAberto] = useState(false)
  const [form, setForm] = useState(MOV_VAZIA)
  const [erros, setErros] = useState({})

  // Edição de entrada (recálculo em cascata)
  const [edicao, setEdicao] = useState(null) // movimentação de entrada em edição
  const [formEdit, setFormEdit] = useState({ data: '', descricao: '', quantidade: '', custoUnitario: '' })
  const [errosEdit, setErrosEdit] = useState({})
  const [relatorio, setRelatorio] = useState(null)

  // Grupos (fazenda + variedade) presentes nas movimentações
  const grupos = useMemo(() => {
    const mapa = new Map()
    for (const m of movs) {
      const chave = m.grupo || `${m.produtor || ''}|${m.variedade || ''}`
      if (!mapa.has(chave)) {
        const rot = [m.produtor, m.variedade].filter(Boolean).join(' · ') || '—'
        mapa.set(chave, rot)
      }
    }
    return [...mapa.entries()].map(([chave, rotulo]) => ({ chave, rotulo }))
  }, [movs])

  function grupoDe(m) {
    return m.grupo || `${m.produtor || ''}|${m.variedade || ''}`
  }
  function rotuloGrupo(m) {
    return [m.produtor, m.variedade].filter(Boolean).join(' · ') || '—'
  }

  const filtradas = useMemo(() => {
    return movs
      .filter((m) => {
        if (dataInicial && m.data < dataInicial) return false
        if (dataFinal && m.data > dataFinal) return false
        if (filtroTipo !== 'todos' && m.tipo !== filtroTipo) return false
        if (filtroGrupo !== 'todos' && grupoDe(m) !== filtroGrupo) return false
        return true
      })
      .sort(
        (a, b) =>
          (a.data || '').localeCompare(b.data || '') || (a.id || 0) - (b.id || 0),
      )
  }, [movs, dataInicial, dataFinal, filtroTipo, filtroGrupo])

  // Totalizadores: entradas/saídas do período filtrado; saldo e custo médio são os atuais.
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
    setFiltroGrupo('todos')
  }

  function exportarCSV() {
    const cabecalho = [
      'Data',
      'Grupo (fazenda + variedade)',
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
      rotuloGrupo(m),
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

    // BOM para o Excel reconhecer os acentos
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kardex-cafe-cru-${hojeISO()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    registrarLog(nomeUsuarioAtual(), 'Estoque MP', ACOES.EXPORTOU, 'Exportou o kardex do café cru (CSV)')
  }

  // ---- Modal de movimentação (saída / ajuste / perda) ----
  function abrirModal() {
    setForm(MOV_VAZIA)
    setErros({})
    setModalAberto(true)
  }

  function atualizarCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  function validar() {
    const e = {}
    const q = Number(String(form.quantidade).replace(',', '.'))
    if (!form.quantidade || Number.isNaN(q) || q <= 0) e.quantidade = 'Informe a quantidade (kg).'
    if (!form.data) e.data = 'Informe a data.'
    if (!form.descricao.trim()) e.descricao = 'Descreva a movimentação.'
    setErros(e)
    return Object.keys(e).length === 0
  }

  // Ajuste positivo é o único tipo do modal que aumenta o estoque (aceita custo).
  const ehAjustePositivo = form.tipo === 'Ajuste (+)'

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

    registrarMovimentacao({
      tipo,
      sentido,
      data: form.data,
      descricao: form.descricao.trim(),
      quantidade: form.quantidade,
      custoUnitario: ehAjustePositivo ? form.custoUnitario : '',
    })

    registrarLog(
      nomeUsuarioAtual(),
      'Estoque MP',
      tipo === TIPOS_MOV.PERDA ? ACOES.ALTEROU : ACOES.AJUSTE_ESTOQUE,
      `Kardex: ${form.tipo} de ${formatarKg(Number(String(form.quantidade).replace(',', '.')))} — ${form.descricao.trim()}`,
    )

    // Recarrega do storage já reprocessado
    setMovs(carregarKardex())
    setResumo(carregarEstoqueResumo())
    setModalAberto(false)
  }

  // ---- Edição de entrada com recálculo em cascata ----
  function abrirEdicao(m) {
    setEdicao(m)
    setFormEdit({
      data: m.data || '',
      descricao: m.descricao || '',
      quantidade: String(Math.abs(Number(m.quantidade)) || ''),
      custoUnitario: String(Number(m.custoUnitario) || ''),
    })
    setErrosEdit({})
  }

  function validarEdit() {
    const e = {}
    const q = Number(String(formEdit.quantidade).replace(',', '.'))
    if (!formEdit.quantidade || Number.isNaN(q) || q <= 0) e.quantidade = 'Informe a quantidade (kg).'
    const c = Number(String(formEdit.custoUnitario).replace(',', '.'))
    if (!formEdit.custoUnitario || Number.isNaN(c) || c < 0) e.custoUnitario = 'Informe o custo unitário.'
    if (!formEdit.data) e.data = 'Informe a data.'
    setErrosEdit(e)
    return Object.keys(e).length === 0
  }

  function salvarEdicao(ev) {
    ev.preventDefault()
    if (!validarEdit()) return

    const rel = editarEntradaCafeCru(edicao.id, {
      data: formEdit.data,
      descricao: formEdit.descricao.trim(),
      quantidade: formEdit.quantidade,
      custoUnitario: formEdit.custoUnitario,
    })

    registrarLog(
      nomeUsuarioAtual(),
      'Estoque MP',
      ACOES.ALTEROU,
      `Editou a entrada ${edicao.descricao} — custo ${formatarMoeda(rel.entrada.custoAntes)} → ${formatarMoeda(rel.entrada.custoDepois)}/kg (${rel.movimentacoesAfetadas.length} saídas recalculadas)`,
    )

    setMovs(carregarKardex())
    setResumo(carregarEstoqueResumo())
    setEdicao(null)
    setRelatorio(rel)
  }

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="kx-breadcrumb">
          <Link to="/estoque" className="ec-link">
            Estoque
          </Link>{' '}
          · Kardex do café cru
        </div>

        <AbasCafeCru />

        <div className="kx-cabecalho">
          <h1 className="kx-titulo">Kardex do café cru</h1>
          <div className="kx-acoes-topo">
            <button className="btn btn-ghost" onClick={abrirModal}>
              + Movimentação
            </button>
            <button className="btn btn-secondary" onClick={exportarCSV} disabled={filtradas.length === 0}>
              ⬇ Exportar CSV
            </button>
          </div>
        </div>

        {/* Filtros */}
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
          <div className="kx-filtro">
            <span className="kx-filtro-label">Fazenda + variedade</span>
            <select value={filtroGrupo} onChange={(e) => setFiltroGrupo(e.target.value)}>
              <option value="todos">Todos</option>
              {grupos.map((g) => (
                <option key={g.chave} value={g.chave}>
                  {g.rotulo}
                </option>
              ))}
            </select>
          </div>
          <button className="kx-limpar" onClick={limparFiltros}>
            Limpar filtros
          </button>
        </div>

        {/* Tabela */}
        <div className="kx-tabela-wrap">
          <table className="kx-tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th>Fazenda + variedade</th>
                <th>Tipo</th>
                <th>Descrição</th>
                <th className="kx-num">Quantidade</th>
                <th className="kx-num">Custo unit.</th>
                <th className="kx-num">Custo total</th>
                <th className="kx-num">Saldo</th>
                <th className="kx-num">Custo médio</th>
                <th className="kx-num">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={10} className="kx-vazio">
                    Nenhuma movimentação encontrada com os filtros atuais.
                  </td>
                </tr>
              )}
              {filtradas.map((m) => (
                <tr key={m.id}>
                  <td>{formatarData(m.data)}</td>
                  <td>{rotuloGrupo(m)}</td>
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
                  <td className="kx-num">
                    {m.tipo === TIPOS_MOV.ENTRADA ? (
                      <button className="kx-limpar" onClick={() => abrirEdicao(m)}>
                        ✎ Editar
                      </button>
                    ) : (
                      <span className="cp-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totalizadores */}
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

      {/* Modal de nova movimentação */}
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
                  placeholder="Ex.: Envio para torrefação — OP 2026-014"
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

      {/* Modal de edição de entrada (recálculo em cascata) */}
      {edicao && (
        <div className="kx-overlay" onMouseDown={() => setEdicao(null)}>
          <div className="kx-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="kx-modal-topo">
              <h2>Editar entrada</h2>
              <button className="kx-fechar" onClick={() => setEdicao(null)} aria-label="Fechar">
                ✕
              </button>
            </div>

            <form onSubmit={salvarEdicao} className="kx-form">
              <p className="campo-ajuda">
                Editar a quantidade ou o custo reprocessa todo o ledger do grupo em cascata.
              </p>
              <div className="kx-form-linha">
                <label className="campo">
                  <span className="campo-label">
                    Data <span className="obrig">*</span>
                  </span>
                  <input
                    type="date"
                    value={formEdit.data}
                    onChange={(e) => setFormEdit((f) => ({ ...f, data: e.target.value }))}
                  />
                  {errosEdit.data && <span className="campo-erro">{errosEdit.data}</span>}
                </label>
                <label className="campo">
                  <span className="campo-label">
                    Quantidade (kg) <span className="obrig">*</span>
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formEdit.quantidade}
                    onChange={(e) => setFormEdit((f) => ({ ...f, quantidade: e.target.value }))}
                  />
                  {errosEdit.quantidade && <span className="campo-erro">{errosEdit.quantidade}</span>}
                </label>
              </div>
              <label className="campo">
                <span className="campo-label">
                  Custo unitário (R$/kg) <span className="obrig">*</span>
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formEdit.custoUnitario}
                  onChange={(e) => setFormEdit((f) => ({ ...f, custoUnitario: e.target.value }))}
                />
                {errosEdit.custoUnitario && <span className="campo-erro">{errosEdit.custoUnitario}</span>}
              </label>
              <label className="campo">
                <span className="campo-label">Descrição</span>
                <input
                  type="text"
                  value={formEdit.descricao}
                  onChange={(e) => setFormEdit((f) => ({ ...f, descricao: e.target.value }))}
                />
              </label>

              <div className="kx-form-acoes">
                <button type="button" className="btn btn-ghost" onClick={() => setEdicao(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Salvar e recalcular
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <RelatorioImpacto rel={relatorio} onFechar={() => setRelatorio(null)} />
    </div>
  )
}
