import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Topbar from '../../components/Topbar'
import AbasCafeCru from './AbasCafeCru'
import { formatarMoeda, formatarData, formatarKg, hojeISO } from '../../utils/formato'
import { registrarLog, ACOES } from '../../utils/auditoria'
import { nomeUsuarioAtual } from '../../utils/permissoes'
import {
  carregarLotesCru,
  criarLoteCru,
  editarLoteCru,
  excluirLoteCru,
  atualizarSaldoLote,
} from '../../utils/lotesCru'
import { recalcularOrdensDoGrupo } from '../../utils/cascata'
import RelatorioImpacto from '../../components/RelatorioImpacto'
import './EntradaCafe.css'

const KG_POR_SACA = 60

const TIPOS_CAFE = ['Arábica', 'Canephora (Robusta)', 'Blend']
const PROCESSOS = ['Natural', 'Lavado', 'Honey', 'Cereja Descascado']
const DEPOSITOS = ['Depósito Principal']

const FORM_VAZIO = {
  tipoEntrada: 'saca',
  sacas: '1',
  pesoKg: '',
  tipoCafe: 'Arábica',
  produtor: '',
  cidade: '',
  estado: '',
  variedade: '',
  processo: 'Natural',
  safra: String(new Date().getFullYear()),
  qualidade: '',
  umidade: '',
  custoTotal: '',
  notaFiscal: '',
  fornecedor: '',
  recebimento: hojeISO(),
  deposito: 'Depósito Principal',
  observacoes: '',
}

// Peso total conforme o tipo de entrada
function calcularPeso(form) {
  if (form.tipoEntrada === 'saca') {
    const s = Number(form.sacas)
    return Number.isNaN(s) ? 0 : s * KG_POR_SACA
  }
  const p = Number(String(form.pesoKg).replace(',', '.'))
  return Number.isNaN(p) ? 0 : p
}

export default function EntradaCafe() {
  const [lotes, setLotes] = useState([])
  const [busca, setBusca] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [erros, setErros] = useState({})
  const [relatorio, setRelatorio] = useState(null)
  const [salvando, setSalvando] = useState(false)

  // Carrega os lotes da API (fonte da verdade agora é o PostgreSQL).
  async function recarregar() {
    setLotes(await carregarLotesCru())
  }
  useEffect(() => {
    recarregar()
  }, [])

  const lotesFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return lotes
    return lotes.filter(
      (l) =>
        l.produtor.toLowerCase().includes(termo) ||
        (l.codigo || '').toLowerCase().includes(termo) ||
        (l.tipoCafe || '').toLowerCase().includes(termo) ||
        (l.variedade || '').toLowerCase().includes(termo),
    )
  }, [lotes, busca])

  const resumo = useMemo(() => {
    let kgTotal = 0
    let custoPonderado = 0
    for (const l of lotes) {
      const saldo = Number(l.saldoDisponivel) || 0
      kgTotal += saldo
      custoPonderado += (Number(l.custoPorKg) || 0) * saldo
    }
    return {
      kgTotal,
      lotes: lotes.length,
      custoMedio: kgTotal > 0 ? custoPonderado / kgTotal : 0,
    }
  }, [lotes])

  // Cálculos em tempo real do formulário
  const pesoTotalForm = useMemo(() => calcularPeso(form), [form])
  const custoPorKgForm = useMemo(() => {
    const custo = Number(String(form.custoTotal).replace(',', '.'))
    if (!custo || Number.isNaN(custo) || pesoTotalForm <= 0) return 0
    return custo / pesoTotalForm
  }, [form.custoTotal, pesoTotalForm])

  function abrirNova() {
    setEditandoId(null)
    setForm(FORM_VAZIO)
    setErros({})
    setModalAberto(true)
  }

  function abrirEdicao(lote) {
    setEditandoId(lote.id)
    setForm({
      tipoEntrada: lote.tipoEntrada,
      sacas: lote.tipoEntrada === 'saca' ? String(lote.sacas) : '1',
      pesoKg: lote.tipoEntrada === 'personalizado' ? String(lote.pesoTotal) : '',
      tipoCafe: lote.tipoCafe,
      produtor: lote.produtor,
      cidade: lote.cidade || '',
      estado: lote.estado || '',
      variedade: lote.variedade || '',
      processo: lote.processo,
      safra: lote.safra || '',
      qualidade: lote.qualidade || '',
      umidade: lote.umidade || '',
      custoTotal: String(lote.custoTotal),
      notaFiscal: lote.notaFiscal || '',
      fornecedor: lote.fornecedor || '',
      recebimento: lote.recebimento,
      deposito: lote.deposito || 'Depósito Principal',
      observacoes: lote.observacoes || '',
    })
    setErros({})
    setModalAberto(true)
  }

  function fecharModal() {
    setModalAberto(false)
  }

  function atualizarCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  function validar() {
    const e = {}
    if (!form.produtor.trim()) e.produtor = 'Informe o produtor / fazenda.'
    if (form.tipoEntrada === 'saca') {
      const s = Number(form.sacas)
      if (!form.sacas || Number.isNaN(s) || s <= 0)
        e.sacas = 'Informe a quantidade de sacas.'
    } else {
      const p = Number(String(form.pesoKg).replace(',', '.'))
      if (!form.pesoKg || Number.isNaN(p) || p <= 0) e.pesoKg = 'Informe o peso em kg.'
    }
    const custo = Number(String(form.custoTotal).replace(',', '.'))
    if (!form.custoTotal || Number.isNaN(custo) || custo <= 0)
      e.custoTotal = 'Informe o custo total pago.'
    if (!form.recebimento) e.recebimento = 'Informe a data de recebimento.'
    setErros(e)
    return Object.keys(e).length === 0
  }

  async function salvar(e) {
    e.preventDefault()
    if (!validar()) return

    const peso = calcularPeso(form)
    const custo = Number(String(form.custoTotal).replace(',', '.'))
    const custoPorKg = peso > 0 ? custo / peso : 0
    const sacas = form.tipoEntrada === 'saca' ? Number(form.sacas) : peso / KG_POR_SACA

    const dados = {
      recebimento: form.recebimento,
      tipoEntrada: form.tipoEntrada,
      sacas,
      pesoTotal: peso,
      tipoCafe: form.tipoCafe,
      produtor: form.produtor.trim(),
      cidade: form.cidade.trim(),
      estado: form.estado.trim().toUpperCase(),
      variedade: form.variedade.trim(),
      processo: form.processo,
      safra: form.safra.trim(),
      qualidade: form.qualidade.trim(),
      umidade: form.umidade.trim(),
      custoTotal: custo,
      custoPorKg,
      notaFiscal: form.notaFiscal.trim(),
      fornecedor: form.fornecedor.trim(),
      deposito: form.deposito,
      observacoes: form.observacoes.trim(),
    }

    const autor = nomeUsuarioAtual()
    setSalvando(true)
    try {
      if (editandoId) {
        const loteAtual = lotes.find((l) => l.id === editandoId)
        // Edita o lote + sincroniza a ENTRADA no kardex e recalcula o grupo (backend).
        const rel = await editarLoteCru(editandoId, dados)
        // Preserva o consumo já ocorrido ao mudar o peso do lote.
        if (loteAtual) {
          const consumido = (Number(loteAtual.pesoTotal) || 0) - (Number(loteAtual.saldoDisponivel) || 0)
          const novoSaldo = Math.max(0, peso - consumido)
          await atualizarSaldoLote(editandoId, novoSaldo)
        }
        registrarLog(
          autor,
          'Estoque MP',
          ACOES.ALTEROU,
          `Editou o lote de ${dados.produtor} (${formatarKg(peso)})`,
        )
        // Recalcula em cascata as ordens de produção que consumiram esse grupo.
        const ordens = await recalcularOrdensDoGrupo(dados.produtor, dados.variedade)
        if (rel) setRelatorio({ ...rel, ordens })
      } else {
        // Cria o lote — o backend gera o código LC-AAAA-NNN e lança a ENTRADA no kardex.
        const criado = await criarLoteCru(dados)
        registrarLog(
          autor,
          'Estoque MP',
          ACOES.INCLUIU,
          `Registrou entrada ${criado?.codigo || ''} — ${dados.produtor} (${formatarKg(peso)})`,
        )
      }
      await recarregar()
      setModalAberto(false)
    } catch (err) {
      setErros((prev) => ({ ...prev, geral: err.message || 'Falha ao salvar o lote.' }))
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(id) {
    if (window.confirm('Excluir este lote de entrada? Esta ação não pode ser desfeita.')) {
      const lote = lotes.find((l) => l.id === id)
      await excluirLoteCru(id)
      registrarLog(
        nomeUsuarioAtual(),
        'Estoque MP',
        ACOES.EXCLUIU,
        lote ? `Excluiu o lote ${lote.codigo} — ${lote.produtor}` : 'Excluiu um lote de entrada',
      )
      await recarregar()
    }
  }

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="ec-cabecalho">
          <div>
            <div className="ec-breadcrumb">
              <Link to="/estoque" className="ec-link">
                Estoque
              </Link>{' '}
              · Entrada de café cru
            </div>
            <h1 className="ec-titulo">Entrada de café cru</h1>
          </div>
          <button className="btn btn-primary" onClick={abrirNova}>
            + Nova entrada
          </button>
        </div>

        <AbasCafeCru />

        {/* Cards de resumo */}
        <div className="ec-cards">
          <div className="ec-card">
            <span className="ec-card-label">Total em estoque</span>
            <strong className="ec-card-valor">{formatarKg(resumo.kgTotal)}</strong>
            <span className="ec-card-nota">Saldo disponível somado</span>
          </div>
          <div className="ec-card">
            <span className="ec-card-label">Lotes</span>
            <strong className="ec-card-valor">{resumo.lotes}</strong>
            <span className="ec-card-nota">Entradas registradas</span>
          </div>
          <div className="ec-card">
            <span className="ec-card-label">Custo médio / kg</span>
            <strong className="ec-card-valor">{formatarMoeda(resumo.custoMedio)}</strong>
            <span className="ec-card-nota">Ponderado pelo saldo</span>
          </div>
        </div>

        {/* Busca */}
        <div className="ec-filtros">
          <div className="ec-busca">
            <span className="ec-busca-icone">🔍</span>
            <input
              type="text"
              placeholder="Buscar por lote, produtor, tipo ou variedade..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>

        {/* Tabela */}
        <div className="ec-tabela-wrap">
          <table className="ec-tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th>Produtor / fazenda</th>
                <th>Tipo</th>
                <th>Sacas / peso</th>
                <th className="col-num">Custo / kg</th>
                <th className="col-num">Custo total</th>
                <th className="col-num">Saldo disponível</th>
                <th className="col-num">Custo disponível</th>
                <th>Status</th>
                <th className="col-acoes">Ações</th>
              </tr>
            </thead>
            <tbody>
              {lotesFiltrados.length === 0 && (
                <tr>
                  <td colSpan={10} className="ec-vazio">
                    Nenhuma entrada encontrada.
                  </td>
                </tr>
              )}
              {lotesFiltrados.map((l) => (
                <tr key={l.id}>
                  <td>{formatarData(l.recebimento)}</td>
                  <td>
                    <div className="ec-produtor">{l.produtor}</div>
                    <div className="ec-lote-codigo">{l.codigo}</div>
                  </td>
                  <td>
                    <div>{l.tipoCafe}</div>
                    {l.variedade && <div className="ec-sub">{l.variedade}</div>}
                  </td>
                  <td>
                    {l.tipoEntrada === 'saca' ? (
                      <div>
                        {l.sacas} {l.sacas === 1 ? 'saca' : 'sacas'}
                      </div>
                    ) : (
                      <div>Peso personalizado</div>
                    )}
                    <div className="ec-sub">{formatarKg(l.pesoTotal)}</div>
                  </td>
                  <td className="col-num">{formatarMoeda(l.custoPorKg)}</td>
                  <td className="col-num">
                    {formatarMoeda((Number(l.custoPorKg) || 0) * (Number(l.pesoTotal) || 0))}
                  </td>
                  <td className="col-num ec-saldo">{formatarKg(l.saldoDisponivel)}</td>
                  <td className="col-num">
                    {formatarMoeda((Number(l.saldoDisponivel) || 0) * (Number(l.custoPorKg) || 0))}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        l.status === 'esgotado' ? 'badge-cancelado' : 'badge-pago'
                      }`}
                    >
                      {l.status === 'esgotado' ? 'Esgotado' : 'Disponível'}
                    </span>
                  </td>
                  <td className="col-acoes">
                    <div className="ec-acoes">
                      <button className="ec-acao" onClick={() => abrirEdicao(l)}>
                        ✎ Editar
                      </button>
                      <button
                        className="ec-acao ec-acao-excluir"
                        onClick={() => excluir(l.id)}
                      >
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

      {/* Modal de formulário */}
      {modalAberto && (
        <div className="ec-overlay" onMouseDown={fecharModal}>
          <div className="ec-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="ec-modal-topo">
              <h2>{editandoId ? 'Editar entrada' : 'Nova entrada de café cru'}</h2>
              <button className="ec-fechar" onClick={fecharModal} aria-label="Fechar">
                ✕
              </button>
            </div>

            <form onSubmit={salvar} className="ec-form">
              {/* Tipo de entrada */}
              <div className="ec-secao">
                <h3 className="ec-secao-titulo">Quantidade</h3>
                <div className="ec-toggle">
                  <button
                    type="button"
                    className={`ec-toggle-btn ${form.tipoEntrada === 'saca' ? 'ativo' : ''}`}
                    onClick={() => atualizarCampo('tipoEntrada', 'saca')}
                  >
                    Saca (60 kg padrão)
                  </button>
                  <button
                    type="button"
                    className={`ec-toggle-btn ${
                      form.tipoEntrada === 'personalizado' ? 'ativo' : ''
                    }`}
                    onClick={() => atualizarCampo('tipoEntrada', 'personalizado')}
                  >
                    Peso personalizado
                  </button>
                </div>

                <div className="ec-form-linha">
                  {form.tipoEntrada === 'saca' ? (
                    <label className="campo">
                      <span className="campo-label">
                        Quantidade de sacas <span className="obrig">*</span>
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={form.sacas}
                        onChange={(e) => atualizarCampo('sacas', e.target.value)}
                      />
                      {erros.sacas && <span className="campo-erro">{erros.sacas}</span>}
                    </label>
                  ) : (
                    <label className="campo">
                      <span className="campo-label">
                        Peso (kg) <span className="obrig">*</span>
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.pesoKg}
                        onChange={(e) => atualizarCampo('pesoKg', e.target.value)}
                      />
                      {erros.pesoKg && <span className="campo-erro">{erros.pesoKg}</span>}
                    </label>
                  )}

                  <label className="campo">
                    <span className="campo-label">Peso total</span>
                    <div className="ec-calculado">{formatarKg(pesoTotalForm)}</div>
                  </label>
                </div>
              </div>

              {/* Identificação do café */}
              <div className="ec-secao">
                <h3 className="ec-secao-titulo">Café</h3>
                <div className="ec-form-linha">
                  <label className="campo">
                    <span className="campo-label">Tipo de café</span>
                    <select
                      value={form.tipoCafe}
                      onChange={(e) => atualizarCampo('tipoCafe', e.target.value)}
                    >
                      {TIPOS_CAFE.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="campo">
                    <span className="campo-label">Processo</span>
                    <select
                      value={form.processo}
                      onChange={(e) => atualizarCampo('processo', e.target.value)}
                    >
                      {PROCESSOS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="campo">
                  <span className="campo-label">
                    Produtor / fazenda <span className="obrig">*</span>
                  </span>
                  <input
                    type="text"
                    value={form.produtor}
                    onChange={(e) => atualizarCampo('produtor', e.target.value)}
                    placeholder="Ex.: Fazenda Serra Verde"
                  />
                  {erros.produtor && <span className="campo-erro">{erros.produtor}</span>}
                </label>

                <div className="ec-form-linha">
                  <label className="campo">
                    <span className="campo-label">Cidade de origem</span>
                    <input
                      type="text"
                      value={form.cidade}
                      onChange={(e) => atualizarCampo('cidade', e.target.value)}
                      placeholder="Ex.: Carmo de Minas"
                    />
                  </label>
                  <label className="campo campo-uf">
                    <span className="campo-label">Estado (UF)</span>
                    <input
                      type="text"
                      maxLength={2}
                      value={form.estado}
                      onChange={(e) => atualizarCampo('estado', e.target.value)}
                      placeholder="MG"
                    />
                  </label>
                </div>

                <div className="ec-form-linha">
                  <label className="campo">
                    <span className="campo-label">Variedade</span>
                    <input
                      type="text"
                      value={form.variedade}
                      onChange={(e) => atualizarCampo('variedade', e.target.value)}
                      placeholder="Ex.: Bourbon, Catuaí, Mundo Novo"
                    />
                  </label>
                  <label className="campo">
                    <span className="campo-label">Safra (ano)</span>
                    <input
                      type="number"
                      value={form.safra}
                      onChange={(e) => atualizarCampo('safra', e.target.value)}
                      placeholder="2025"
                    />
                  </label>
                </div>

                <div className="ec-form-linha">
                  <label className="campo">
                    <span className="campo-label">Qualidade / pontuação</span>
                    <input
                      type="number"
                      step="0.5"
                      value={form.qualidade}
                      onChange={(e) => atualizarCampo('qualidade', e.target.value)}
                      placeholder="Ex.: 84 (opcional)"
                    />
                  </label>
                  <label className="campo">
                    <span className="campo-label">Umidade (%)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={form.umidade}
                      onChange={(e) => atualizarCampo('umidade', e.target.value)}
                      placeholder="Ex.: 11 (opcional)"
                    />
                  </label>
                </div>
              </div>

              {/* Custo e recebimento */}
              <div className="ec-secao">
                <h3 className="ec-secao-titulo">Custo e recebimento</h3>
                <div className="ec-form-linha">
                  <label className="campo">
                    <span className="campo-label">
                      Custo total pago (R$) <span className="obrig">*</span>
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.custoTotal}
                      onChange={(e) => atualizarCampo('custoTotal', e.target.value)}
                      placeholder="0,00"
                    />
                    {erros.custoTotal && (
                      <span className="campo-erro">{erros.custoTotal}</span>
                    )}
                  </label>
                  <label className="campo">
                    <span className="campo-label">Custo por kg</span>
                    <div className="ec-calculado">{formatarMoeda(custoPorKgForm)}</div>
                  </label>
                </div>

                <div className="ec-form-linha">
                  <label className="campo">
                    <span className="campo-label">
                      Data de recebimento <span className="obrig">*</span>
                    </span>
                    <input
                      type="date"
                      value={form.recebimento}
                      onChange={(e) => atualizarCampo('recebimento', e.target.value)}
                    />
                    {erros.recebimento && (
                      <span className="campo-erro">{erros.recebimento}</span>
                    )}
                  </label>
                  <label className="campo">
                    <span className="campo-label">Depósito de destino</span>
                    <select
                      value={form.deposito}
                      onChange={(e) => atualizarCampo('deposito', e.target.value)}
                    >
                      {DEPOSITOS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="ec-form-linha">
                  <label className="campo">
                    <span className="campo-label">Nº da nota fiscal</span>
                    <input
                      type="text"
                      value={form.notaFiscal}
                      onChange={(e) => atualizarCampo('notaFiscal', e.target.value)}
                      placeholder="Opcional"
                    />
                  </label>
                  <label className="campo">
                    <span className="campo-label">Fornecedor</span>
                    <input
                      type="text"
                      value={form.fornecedor}
                      onChange={(e) => atualizarCampo('fornecedor', e.target.value)}
                      placeholder="Opcional"
                    />
                  </label>
                </div>

                <label className="campo">
                  <span className="campo-label">Observações</span>
                  <textarea
                    rows={2}
                    value={form.observacoes}
                    onChange={(e) => atualizarCampo('observacoes', e.target.value)}
                    placeholder="Anotações internas (opcional)"
                  />
                </label>
              </div>

              {erros.geral && <div className="campo-erro">{erros.geral}</div>}
              <div className="ec-form-acoes">
                <button type="button" className="btn btn-ghost" onClick={fecharModal}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={salvando}>
                  {salvando ? 'Salvando…' : editandoId ? 'Salvar alterações' : 'Registrar entrada'}
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
