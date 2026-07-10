import { useState } from 'react'
import { Link } from 'react-router-dom'
import Topbar from '../../../components/Topbar'
import AbasPA from './AbasPA'
import { registrarLog, ACOES } from '../../../utils/auditoria'
import { nomeUsuarioAtual } from '../../../utils/permissoes'
import {
  carregarPA,
  salvarPA,
  proximoIdPA,
  embalagensPadrao,
  formatarGramatura,
  GRAMATURAS,
} from '../../../utils/pa'
import '../CafeCru.css'
import './PA.css'

const FORM_VAZIO = {
  nome: '',
  gramaturas: [250, 1000],
  ativo: true,
}

export default function PACadastro() {
  const [pas, setPas] = useState(carregarPA)
  const [modalAberto, setModalAberto] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [erros, setErros] = useState({})

  function persistir(lista) {
    setPas(lista)
    salvarPA(lista)
  }

  function abrirNovo() {
    setEditandoId(null)
    setForm(FORM_VAZIO)
    setErros({})
    setModalAberto(true)
  }

  function abrirEdicao(pa) {
    setEditandoId(pa.id)
    setForm({ nome: pa.nome, gramaturas: [...(pa.gramaturas || [])], ativo: pa.ativo !== false })
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

  function validar() {
    const e = {}
    if (!form.nome.trim()) e.nome = 'Informe o nome do produto.'
    if (form.gramaturas.length === 0) e.gramaturas = 'Selecione ao menos uma gramatura.'
    setErros(e)
    return Object.keys(e).length === 0
  }

  function salvar(e) {
    e.preventDefault()
    if (!validar()) return

    const { embalagem250Id, embalagem1000Id } = embalagensPadrao()
    const dados = {
      nome: form.nome.trim(),
      gramaturas: form.gramaturas,
      embalagem250Id,
      embalagem1000Id,
      ativo: form.ativo,
    }

    const autor = nomeUsuarioAtual()
    if (editandoId) {
      persistir(pas.map((p) => (p.id === editandoId ? { ...p, ...dados } : p)))
      registrarLog(autor, 'Estoque PA', ACOES.ALTEROU, `Alterou o produto ${dados.nome}`)
    } else {
      persistir([...pas, { id: proximoIdPA(pas), ...dados }])
      registrarLog(autor, 'Estoque PA', ACOES.INCLUIU, `Cadastrou o produto ${dados.nome}`)
    }
    setModalAberto(false)
  }

  function excluir(id) {
    const pa = pas.find((p) => p.id === id)
    if (window.confirm('Excluir este produto? As ordens de produção já registradas serão mantidas.')) {
      persistir(pas.filter((p) => p.id !== id))
      registrarLog(
        nomeUsuarioAtual(),
        'Estoque PA',
        ACOES.EXCLUIU,
        pa ? `Excluiu o produto ${pa.nome}` : 'Excluiu um produto',
      )
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
