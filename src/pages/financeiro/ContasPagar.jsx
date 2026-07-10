import { useMemo, useState } from 'react'
import Topbar from '../../components/Topbar'
import { formatarMoeda, formatarData, hojeISO } from '../../utils/formato'
import './ContasPagar.css'

const CATEGORIAS = [
  'Café em grão / matéria-prima',
  'Embalagens',
  'Caixas',
  'Etiquetas',
  'Frete e transporte',
  'Condomínio',
  'Energia elétrica',
  'Água',
  'Locação de equipamentos',
  'Manutenção e reparos',
  'Colaboradores / folha',
  'Pró-labore',
  'Lucros distribuídos',
  'Marketing e publicidade',
  'Impostos e taxas',
  'Gastos gerais / diversos',
  'Honorários contábeis',
  'Embalagem de envio / correios',
]

const FORMAS_PAGAMENTO = ['PIX', 'Boleto', 'Dinheiro', 'Cartão', 'Transferência']

// Status "reais" armazenados. 'vencido' é derivado automaticamente da data.
const STATUS = {
  A_PAGAR: 'a pagar',
  PAGO: 'pago',
  VENCIDO: 'vencido',
  CANCELADO: 'cancelado',
}

const DADOS_INICIAIS = [
  {
    id: 1,
    favorecido: 'Fazenda Serra Verde',
    categoria: 'Café em grão / matéria-prima',
    vencimento: '2025-07-05',
    valor: 1200,
    status: STATUS.VENCIDO,
    formaPagamento: 'Boleto',
    observacao: 'Saca de café verde — lote de julho.',
  },
  {
    id: 2,
    favorecido: 'Embalaflex',
    categoria: 'Embalagens',
    vencimento: '2025-07-15',
    valor: 380,
    status: STATUS.A_PAGAR,
    formaPagamento: 'PIX',
    observacao: '',
  },
  {
    id: 3,
    favorecido: 'Condomínio industrial',
    categoria: 'Condomínio',
    vencimento: '2025-07-10',
    valor: 950,
    status: STATUS.A_PAGAR,
    formaPagamento: 'Boleto',
    observacao: '',
  },
  {
    id: 4,
    favorecido: 'Copel',
    categoria: 'Energia elétrica',
    vencimento: '2025-06-28',
    valor: 420,
    status: STATUS.PAGO,
    formaPagamento: 'Débito automático',
    observacao: '',
  },
  {
    id: 5,
    favorecido: 'Gráfica Rápida',
    categoria: 'Etiquetas',
    vencimento: '2025-07-20',
    valor: 180,
    status: STATUS.A_PAGAR,
    formaPagamento: 'PIX',
    observacao: 'Etiquetas adesivas dos 250g.',
  },
  {
    id: 6,
    favorecido: 'Colaborador João',
    categoria: 'Colaboradores / folha',
    vencimento: '2025-07-05',
    valor: 2200,
    status: STATUS.PAGO,
    formaPagamento: 'Transferência',
    observacao: 'Salário mensal.',
  },
]

// Aplica a detecção automática de vencimento.
function statusEfetivo(conta) {
  if (conta.status === STATUS.A_PAGAR && conta.vencimento && conta.vencimento < hojeISO()) {
    return STATUS.VENCIDO
  }
  return conta.status
}

function rotuloStatus(status) {
  switch (status) {
    case STATUS.PAGO:
      return 'Pago'
    case STATUS.VENCIDO:
      return 'Vencido'
    case STATUS.CANCELADO:
      return 'Cancelado'
    default:
      return 'A pagar'
  }
}

function classeBadge(status) {
  switch (status) {
    case STATUS.PAGO:
      return 'badge badge-pago'
    case STATUS.VENCIDO:
      return 'badge badge-vencido'
    case STATUS.CANCELADO:
      return 'badge badge-cancelado'
    default:
      return 'badge badge-a-pagar'
  }
}

const FORM_VAZIO = {
  favorecido: '',
  valor: '',
  vencimento: '',
  categoria: '',
  formaPagamento: '',
  status: STATUS.A_PAGAR,
  observacao: '',
}

export default function ContasPagar() {
  const [contas, setContas] = useState(DADOS_INICIAIS)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroCategoria, setFiltroCategoria] = useState('todas')

  const [modalAberto, setModalAberto] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [erros, setErros] = useState({})

  // Lista com status efetivo já calculado
  const contasCalculadas = useMemo(
    () => contas.map((c) => ({ ...c, statusEfetivo: statusEfetivo(c) })),
    [contas],
  )

  const contasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return contasCalculadas.filter((c) => {
      const casaBusca =
        !termo ||
        c.favorecido.toLowerCase().includes(termo) ||
        (c.categoria || '').toLowerCase().includes(termo) ||
        (c.observacao || '').toLowerCase().includes(termo)
      const casaStatus = filtroStatus === 'todos' || c.statusEfetivo === filtroStatus
      const casaCategoria = filtroCategoria === 'todas' || c.categoria === filtroCategoria
      return casaBusca && casaStatus && casaCategoria
    })
  }, [contasCalculadas, busca, filtroStatus, filtroCategoria])

  const resumo = useMemo(() => {
    let aPagar = 0
    let vencido = 0
    let pago = 0
    for (const c of contasCalculadas) {
      if (c.statusEfetivo === STATUS.PAGO) pago += c.valor
      else if (c.statusEfetivo === STATUS.VENCIDO) vencido += c.valor
      else if (c.statusEfetivo === STATUS.A_PAGAR) aPagar += c.valor
    }
    return {
      totalAberto: aPagar + vencido,
      vencido,
      pago,
      quantidade: contasCalculadas.length,
    }
  }, [contasCalculadas])

  function abrirNova() {
    setEditandoId(null)
    setForm(FORM_VAZIO)
    setErros({})
    setModalAberto(true)
  }

  function abrirEdicao(conta) {
    setEditandoId(conta.id)
    setForm({
      favorecido: conta.favorecido,
      valor: String(conta.valor),
      vencimento: conta.vencimento,
      categoria: conta.categoria || '',
      formaPagamento: conta.formaPagamento || '',
      status: conta.status,
      observacao: conta.observacao || '',
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
    if (!form.favorecido.trim()) e.favorecido = 'Informe o favorecido.'
    const valorNum = Number(String(form.valor).replace(',', '.'))
    if (!form.valor || Number.isNaN(valorNum) || valorNum <= 0)
      e.valor = 'Informe um valor válido.'
    if (!form.vencimento) e.vencimento = 'Informe o vencimento.'
    setErros(e)
    return Object.keys(e).length === 0
  }

  function salvar(e) {
    e.preventDefault()
    if (!validar()) return

    const valorNum = Number(String(form.valor).replace(',', '.'))
    const dados = {
      favorecido: form.favorecido.trim(),
      valor: valorNum,
      vencimento: form.vencimento,
      categoria: form.categoria,
      formaPagamento: form.formaPagamento,
      status: form.status,
      observacao: form.observacao.trim(),
    }

    if (editandoId) {
      setContas((lista) =>
        lista.map((c) => (c.id === editandoId ? { ...c, ...dados } : c)),
      )
    } else {
      const novoId = contas.reduce((max, c) => Math.max(max, c.id), 0) + 1
      setContas((lista) => [...lista, { id: novoId, ...dados }])
    }
    setModalAberto(false)
  }

  function marcarPago(id) {
    setContas((lista) =>
      lista.map((c) => (c.id === id ? { ...c, status: STATUS.PAGO } : c)),
    )
  }

  function excluir(id) {
    if (window.confirm('Excluir esta conta? Esta ação não pode ser desfeita.')) {
      setContas((lista) => lista.filter((c) => c.id !== id))
    }
  }

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="cp-cabecalho">
          <div>
            <div className="cp-breadcrumb">Financeiro · Contas a pagar</div>
            <h1 className="cp-titulo">Contas a pagar</h1>
          </div>
          <button className="btn btn-primary" onClick={abrirNova}>
            + Nova conta
          </button>
        </div>

        {/* Cards de resumo */}
        <div className="cp-cards">
          <div className="cp-card">
            <span className="cp-card-label">Total a pagar</span>
            <strong className="cp-card-valor">{formatarMoeda(resumo.totalAberto)}</strong>
            <span className="cp-card-nota">Aberto + vencido</span>
          </div>
          <div className="cp-card cp-card-danger">
            <span className="cp-card-label">Vencido</span>
            <strong className="cp-card-valor">{formatarMoeda(resumo.vencido)}</strong>
            <span className="cp-card-nota">Atenção necessária</span>
          </div>
          <div className="cp-card cp-card-success">
            <span className="cp-card-label">Pago</span>
            <strong className="cp-card-valor">{formatarMoeda(resumo.pago)}</strong>
            <span className="cp-card-nota">Quitado no período</span>
          </div>
          <div className="cp-card">
            <span className="cp-card-label">Quantidade</span>
            <strong className="cp-card-valor">{resumo.quantidade}</strong>
            <span className="cp-card-nota">Contas cadastradas</span>
          </div>
        </div>

        {/* Filtros */}
        <div className="cp-filtros">
          <div className="cp-busca">
            <span className="cp-busca-icone">🔍</span>
            <input
              type="text"
              placeholder="Buscar por favorecido, categoria ou observação..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
            <option value="todos">Todos os status</option>
            <option value={STATUS.A_PAGAR}>A pagar</option>
            <option value={STATUS.VENCIDO}>Vencido</option>
            <option value={STATUS.PAGO}>Pago</option>
            <option value={STATUS.CANCELADO}>Cancelado</option>
          </select>
          <select
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value)}
          >
            <option value="todas">Todas as categorias</option>
            {CATEGORIAS.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Tabela */}
        <div className="cp-tabela-wrap">
          <table className="cp-tabela">
            <thead>
              <tr>
                <th>Favorecido</th>
                <th>Categoria</th>
                <th>Vencimento</th>
                <th className="col-valor">Valor</th>
                <th>Status</th>
                <th className="col-acoes">Ações</th>
              </tr>
            </thead>
            <tbody>
              {contasFiltradas.length === 0 && (
                <tr>
                  <td colSpan={6} className="cp-vazio">
                    Nenhuma conta encontrada com os filtros atuais.
                  </td>
                </tr>
              )}
              {contasFiltradas.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="cp-favorecido">{c.favorecido}</div>
                    {c.observacao && <div className="cp-obs">{c.observacao}</div>}
                  </td>
                  <td>{c.categoria || <span className="cp-muted">—</span>}</td>
                  <td>{formatarData(c.vencimento)}</td>
                  <td className="col-valor cp-valor">{formatarMoeda(c.valor)}</td>
                  <td>
                    <span className={classeBadge(c.statusEfetivo)}>
                      {rotuloStatus(c.statusEfetivo)}
                    </span>
                  </td>
                  <td className="col-acoes">
                    <div className="cp-acoes">
                      {c.statusEfetivo !== STATUS.PAGO &&
                        c.statusEfetivo !== STATUS.CANCELADO && (
                          <button
                            className="cp-acao cp-acao-pago"
                            title="Marcar como pago"
                            onClick={() => marcarPago(c.id)}
                          >
                            ✓ Pagar
                          </button>
                        )}
                      <button
                        className="cp-acao"
                        title="Editar"
                        onClick={() => abrirEdicao(c)}
                      >
                        ✎ Editar
                      </button>
                      <button
                        className="cp-acao cp-acao-excluir"
                        title="Excluir"
                        onClick={() => excluir(c.id)}
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
        <div className="cp-overlay" onMouseDown={fecharModal}>
          <div className="cp-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="cp-modal-topo">
              <h2>{editandoId ? 'Editar conta' : 'Nova conta a pagar'}</h2>
              <button className="cp-fechar" onClick={fecharModal} aria-label="Fechar">
                ✕
              </button>
            </div>

            <form onSubmit={salvar} className="cp-form">
              <label className="campo">
                <span className="campo-label">
                  Favorecido <span className="obrig">*</span>
                </span>
                <input
                  type="text"
                  value={form.favorecido}
                  onChange={(e) => atualizarCampo('favorecido', e.target.value)}
                  placeholder="Ex.: Fazenda Serra Verde"
                />
                {erros.favorecido && <span className="campo-erro">{erros.favorecido}</span>}
              </label>

              <div className="cp-form-linha">
                <label className="campo">
                  <span className="campo-label">
                    Valor (R$) <span className="obrig">*</span>
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.valor}
                    onChange={(e) => atualizarCampo('valor', e.target.value)}
                    placeholder="0,00"
                  />
                  {erros.valor && <span className="campo-erro">{erros.valor}</span>}
                </label>

                <label className="campo">
                  <span className="campo-label">
                    Vencimento <span className="obrig">*</span>
                  </span>
                  <input
                    type="date"
                    value={form.vencimento}
                    onChange={(e) => atualizarCampo('vencimento', e.target.value)}
                  />
                  {erros.vencimento && (
                    <span className="campo-erro">{erros.vencimento}</span>
                  )}
                </label>
              </div>

              <div className="cp-form-linha">
                <label className="campo">
                  <span className="campo-label">Categoria</span>
                  <select
                    value={form.categoria}
                    onChange={(e) => atualizarCampo('categoria', e.target.value)}
                  >
                    <option value="">Sem categoria</option>
                    {CATEGORIAS.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="campo">
                  <span className="campo-label">Forma de pagamento</span>
                  <select
                    value={form.formaPagamento}
                    onChange={(e) => atualizarCampo('formaPagamento', e.target.value)}
                  >
                    <option value="">Não informada</option>
                    {FORMAS_PAGAMENTO.map((fp) => (
                      <option key={fp} value={fp}>
                        {fp}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="campo">
                <span className="campo-label">Status</span>
                <select
                  value={form.status}
                  onChange={(e) => atualizarCampo('status', e.target.value)}
                >
                  <option value={STATUS.A_PAGAR}>A pagar</option>
                  <option value={STATUS.PAGO}>Pago</option>
                  <option value={STATUS.CANCELADO}>Cancelado</option>
                </select>
                <span className="campo-ajuda">
                  Contas "a pagar" com vencimento passado são marcadas como vencidas
                  automaticamente.
                </span>
              </label>

              <label className="campo">
                <span className="campo-label">Observação</span>
                <textarea
                  rows={3}
                  value={form.observacao}
                  onChange={(e) => atualizarCampo('observacao', e.target.value)}
                  placeholder="Anotações internas (opcional)"
                />
              </label>

              <div className="cp-form-acoes">
                <button type="button" className="btn btn-ghost" onClick={fecharModal}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  {editandoId ? 'Salvar alterações' : 'Cadastrar conta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
