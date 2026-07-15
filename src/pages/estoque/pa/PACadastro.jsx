import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Topbar from '../../../components/Topbar'
import AbasPA from './AbasPA'
import { registrarLog, ACOES } from '../../../utils/auditoria'
import { nomeUsuarioAtual } from '../../../utils/permissoes'
import {
  carregarPA,
  criarPA,
  editarPA,
  excluirPA,
  embalagensPadrao,
  formatarGramatura,
  GRAMATURAS,
} from '../../../utils/pa'
import '../CafeCru.css'
import './PA.css'

// Gramaturas do mix de projeção (percentuais que devem somar 100).
const MIX_CAMPOS = [
  { chave: '200', rotulo: '200g' },
  { chave: '250', rotulo: '250g' },
  { chave: '1000', rotulo: '1kg' },
  { chave: 'drip', rotulo: 'Drip' },
]

const MIX_VAZIO = { 200: '', 250: '', 1000: '', drip: '' }

const FORM_VAZIO = {
  nome: '',
  gramaturas: [250, 1000],
  perdaTorraPadrao: '10',
  ativo: true,
  mix: { ...MIX_VAZIO },
}

// Soma dos percentuais do mix (campos vazios contam como 0).
function somaMix(mix) {
  return MIX_CAMPOS.reduce((acc, { chave }) => acc + (Number(String(mix[chave]).replace(',', '.')) || 0), 0)
}

// Percentual sem casas decimais desnecessárias (85 → "85", 33.3 → "33.3").
function formatarPct(n) {
  return Number(n.toFixed(2)).toString()
}

export default function PACadastro() {
  const [pas, setPas] = useState([])
  const [embalagens, setEmbalagens] = useState({ embalagem250Id: null, embalagem1000Id: null })
  const [modalAberto, setModalAberto] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [erros, setErros] = useState({})

  async function recarregar() {
    setPas(await carregarPA())
  }

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const [lista, emb] = await Promise.all([carregarPA(), embalagensPadrao()])
      if (vivo) {
        setPas(lista)
        setEmbalagens(emb)
      }
    })()
    return () => {
      vivo = false
    }
  }, [])

  function abrirNovo() {
    setEditandoId(null)
    setForm(FORM_VAZIO)
    setErros({})
    setModalAberto(true)
  }

  function abrirEdicao(pa) {
    const mix = { ...MIX_VAZIO }
    if (pa.mixProjecao && typeof pa.mixProjecao === 'object') {
      for (const { chave } of MIX_CAMPOS) {
        const v = pa.mixProjecao[chave]
        mix[chave] = v != null && v !== 0 ? String(v) : ''
      }
    }
    setEditandoId(pa.id)
    setForm({
      nome: pa.nome,
      gramaturas: [...(pa.gramaturas || [])],
      perdaTorraPadrao: String(pa.perdaTorraPadrao ?? 10),
      ativo: pa.ativo !== false,
      mix,
    })
    setErros({})
    setModalAberto(true)
  }

  function toggleGramatura(g) {
    setForm((f) => {
      const tem = f.gramaturas.includes(g)
      const gramaturas = tem ? f.gramaturas.filter((x) => x !== g) : [...f.gramaturas, g].sort((a, b) => a - b)
      return { ...f, gramaturas }
    })
  }

  function setMixCampo(chave, valor) {
    setForm((f) => ({ ...f, mix: { ...f.mix, [chave]: valor } }))
  }

  function validar() {
    const e = {}
    if (!form.nome.trim()) e.nome = 'Informe o nome do produto.'
    if (form.gramaturas.length === 0) e.gramaturas = 'Selecione ao menos uma gramatura.'
    // Mix é opcional; mas se preenchido (soma > 0) precisa somar exatamente 100%.
    const total = somaMix(form.mix)
    if (total > 0 && Math.round(total * 100) !== 10000) {
      e.mix = `A soma do mix deve ser exatamente 100%. Total atual: ${formatarPct(total)}%.`
    }
    setErros(e)
    return Object.keys(e).length === 0
  }

  async function salvar(e) {
    e.preventDefault()
    if (!validar()) return

    // Só envia o mix quando configurado (soma 100%); caso contrário, null.
    const totalMix = somaMix(form.mix)
    const mixProjecao =
      totalMix > 0
        ? MIX_CAMPOS.reduce((acc, { chave }) => {
            acc[chave] = Number(String(form.mix[chave]).replace(',', '.')) || 0
            return acc
          }, {})
        : null

    const { embalagem250Id, embalagem1000Id } = embalagens
    const dados = {
      nome: form.nome.trim(),
      gramaturas: form.gramaturas,
      embalagem250Id,
      embalagem1000Id,
      perdaTorraPadrao: Number(String(form.perdaTorraPadrao).replace(',', '.')) || 0,
      ativo: form.ativo,
      mixProjecao,
    }

    const autor = nomeUsuarioAtual()
    if (editandoId) {
      await editarPA(editandoId, dados)
      registrarLog(autor, 'Estoque PA', ACOES.ALTEROU, `Alterou o produto ${dados.nome}`)
    } else {
      await criarPA(dados)
      registrarLog(autor, 'Estoque PA', ACOES.INCLUIU, `Cadastrou o produto ${dados.nome}`)
    }
    await recarregar()
    setModalAberto(false)
  }

  async function excluir(id) {
    const pa = pas.find((p) => p.id === id)
    if (window.confirm('Excluir este produto? As ordens de produção já registradas serão mantidas.')) {
      await excluirPA(id)
      registrarLog(
        nomeUsuarioAtual(),
        'Estoque PA',
        ACOES.EXCLUIU,
        pa ? `Excluiu o produto ${pa.nome}` : 'Excluiu um produto',
      )
      await recarregar()
    }
  }

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="kx-breadcrumb">
          <Link to="/estoque" className="ec-link">
            Estoque
          </Link>{' '}
          · Produtos acabados · Cadastro
        </div>

        <AbasPA />

        <div className="kx-cabecalho">
          <h1 className="kx-titulo">Produtos acabados</h1>
          <button className="btn btn-primary" onClick={abrirNovo}>
            + Novo produto
          </button>
        </div>

        <div className="kx-tabela-wrap">
          <table className="kx-tabela">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Gramaturas</th>
                <th>Status</th>
                <th className="kx-num">Ações</th>
              </tr>
            </thead>
            <tbody>
              {pas.length === 0 && (
                <tr>
                  <td colSpan={4} className="kx-vazio">
                    Nenhum produto cadastrado.
                  </td>
                </tr>
              )}
              {pas.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 700, color: 'var(--verde)' }}>{p.nome}</td>
                  <td>{(p.gramaturas || []).map(formatarGramatura).join(' · ')}</td>
                  <td>
                    <span className={`badge ${p.ativo !== false ? 'badge-pago' : 'badge-cancelado'}`}>
                      {p.ativo !== false ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="kx-num">
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button className="kx-limpar" onClick={() => abrirEdicao(p)}>
                        ✎ Editar
                      </button>
                      <button className="kx-limpar" onClick={() => excluir(p.id)}>
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

      {modalAberto && (
        <div className="kx-overlay" onMouseDown={() => setModalAberto(false)}>
          <div className="kx-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="kx-modal-topo">
              <h2>{editandoId ? 'Editar produto' : 'Novo produto'}</h2>
              <button className="kx-fechar" onClick={() => setModalAberto(false)} aria-label="Fechar">
                ✕
              </button>
            </div>

            <form onSubmit={salvar} className="kx-form">
              <label className="campo">
                <span className="campo-label">
                  Nome <span className="obrig">*</span>
                </span>
                <input
                  type="text"
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex.: Chocolatudo"
                />
                {erros.nome && <span className="campo-erro">{erros.nome}</span>}
              </label>

              <div className="campo">
                <span className="campo-label">Gramaturas</span>
                <div className="pa-check-grupo">
                  {GRAMATURAS.map((g) => (
                    <label key={g} className="pa-check">
                      <input
                        type="checkbox"
                        checked={form.gramaturas.includes(g)}
                        onChange={() => toggleGramatura(g)}
                      />
                      {formatarGramatura(g)}
                    </label>
                  ))}
                </div>
                {erros.gramaturas && <span className="campo-erro">{erros.gramaturas}</span>}
              </div>

              <label className="campo">
                <span className="campo-label">Perda de torra padrão (%)</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={form.perdaTorraPadrao}
                  onChange={(e) => setForm((f) => ({ ...f, perdaTorraPadrao: e.target.value }))}
                  placeholder="Ex.: 10"
                />
                <span className="campo-ajuda">
                  Usada para sugerir o café cru necessário na ordem de produção.
                </span>
              </label>

              <div className="campo">
                <span className="campo-label">Mix de projeção (%)</span>
                <span className="campo-ajuda">
                  Distribuição projetada da produção por gramatura. A soma deve ser exatamente 100%.
                </span>
                <div className="pa-mix-grid">
                  {MIX_CAMPOS.map(({ chave, rotulo }) => (
                    <div key={chave} className="pa-mix-card">
                      <span className="pa-mix-nome">{rotulo}</span>
                      <div className="pa-mix-input">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={form.mix[chave]}
                          onChange={(ev) => setMixCampo(chave, ev.target.value)}
                          placeholder="0"
                        />
                        <span className="pa-mix-simbolo">%</span>
                      </div>
                    </div>
                  ))}
                </div>
                {(() => {
                  const total = somaMix(form.mix)
                  const ok = Math.round(total * 100) === 10000
                  const zero = total === 0
                  const faltam = 100 - total
                  return (
                    <div className={`pa-mix-total ${ok ? 'ok' : zero ? 'neutro' : 'alerta'}`}>
                      {zero
                        ? 'Total: 0% — mix opcional, preencha se quiser projetar.'
                        : ok
                          ? 'Total: 100% ✓'
                          : `Total: ${formatarPct(total)}% — ${
                              faltam > 0 ? `faltam ${formatarPct(faltam)}%` : `excede ${formatarPct(-faltam)}%`
                            }`}
                    </div>
                  )
                })()}
                {erros.mix && <span className="campo-erro">{erros.mix}</span>}
              </div>

              <label className="pa-check">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))}
                />
                Produto ativo
              </label>

              <div className="kx-form-acoes">
                <button type="button" className="btn btn-ghost" onClick={() => setModalAberto(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  {editandoId ? 'Salvar alterações' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
