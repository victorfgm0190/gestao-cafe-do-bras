import { useState } from 'react'
import { Link } from 'react-router-dom'
import Topbar from '../../../components/Topbar'
import AbasInsumos from './AbasInsumos'
import { registrarLog, ACOES } from '../../../utils/auditoria'
import { nomeUsuarioAtual } from '../../../utils/permissoes'
import {
  carregarCadastro,
  salvarCadastro,
  proximoIdCadastro,
  formatarQuantidade,
  UNIDADES,
} from '../../../utils/insumos'
import '../CafeCru.css'
import './Insumos.css'

const FORM_VAZIO = {
  nome: '',
  unidade: 'un',
  estoqueMinimo: '',
  descricao: '',
}

export default function InsumosCadastro() {
  const [insumos, setInsumos] = useState(carregarCadastro)
  const [modalAberto, setModalAberto] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [erros, setErros] = useState({})

  function persistir(lista) {
    setInsumos(lista)
    salvarCadastro(lista)
  }

  function abrirNovo() {
    setEditandoId(null)
    setForm(FORM_VAZIO)
    setErros({})
    setModalAberto(true)
  }

  function abrirEdicao(insumo) {
    setEditandoId(insumo.id)
    setForm({
      nome: insumo.nome,
      unidade: insumo.unidade,
      estoqueMinimo: String(insumo.estoqueMinimo ?? ''),
      descricao: insumo.descricao || '',
    })
    setErros({})
    setModalAberto(true)
  }

  function atualizarCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  function validar() {
    const e = {}
    if (!form.nome.trim()) e.nome = 'Informe o nome do insumo.'
    const min = Number(String(form.estoqueMinimo).replace(',', '.'))
    if (form.estoqueMinimo !== '' && (Number.isNaN(min) || min < 0))
      e.estoqueMinimo = 'Estoque mínimo inválido.'
    setErros(e)
    return Object.keys(e).length === 0
  }

  function salvar(e) {
    e.preventDefault()
    if (!validar()) return

    const dados = {
      nome: form.nome.trim(),
      unidade: form.unidade,
      estoqueMinimo: Number(String(form.estoqueMinimo).replace(',', '.')) || 0,
      descricao: form.descricao.trim(),
    }

    const autor = nomeUsuarioAtual()
    if (editandoId) {
      persistir(insumos.map((i) => (i.id === editandoId ? { ...i, ...dados } : i)))
      registrarLog(autor, 'Insumos', ACOES.ALTEROU, `Alterou o insumo ${dados.nome}`)
    } else {
      const novo = { id: proximoIdCadastro(insumos), ...dados }
      persistir([...insumos, novo])
      registrarLog(autor, 'Insumos', ACOES.INCLUIU, `Cadastrou o insumo ${dados.nome}`)
    }
    setModalAberto(false)
  }

  function excluir(id) {
    const insumo = insumos.find((i) => i.id === id)
    if (
      window.confirm(
        'Excluir este insumo? As movimentações já lançadas no kardex serão mantidas.',
      )
    ) {
      persistir(insumos.filter((i) => i.id !== id))
      registrarLog(
        nomeUsuarioAtual(),
        'Insumos',
        ACOES.EXCLUIU,
        insumo ? `Excluiu o insumo ${insumo.nome}` : 'Excluiu um insumo',
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
          · Insumos · Cadastro
        </div>

        <AbasInsumos />

        <div className="kx-cabecalho">
          <h1 className="kx-titulo">Cadastro de insumos</h1>
          <button className="btn btn-primary" onClick={abrirNovo}>
            + Novo insumo
          </button>
        </div>

        <div className="kx-tabela-wrap">
          <table className="kx-tabela">
            <thead>
              <tr>
                <th>Insumo</th>
                <th>Unidade</th>
                <th className="kx-num">Estoque mínimo</th>
                <th>Descrição</th>
                <th className="kx-num">Ações</th>
              </tr>
            </thead>
            <tbody>
              {insumos.length === 0 && (
                <tr>
                  <td colSpan={5} className="kx-vazio">
                    Nenhum insumo cadastrado.
                  </td>
                </tr>
              )}
              {insumos.map((i) => (
                <tr key={i.id}>
                  <td style={{ fontWeight: 700, color: 'var(--verde)' }}>{i.nome}</td>
                  <td>{i.unidade}</td>
                  <td className="kx-num">{formatarQuantidade(i.estoqueMinimo, i.unidade)}</td>
                  <td className="kx-desc">{i.descricao || <span className="cp-muted">—</span>}</td>
                  <td className="kx-num">
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button className="kx-limpar" onClick={() => abrirEdicao(i)}>
                        ✎ Editar
                      </button>
                      <button className="kx-limpar" onClick={() => excluir(i.id)}>
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
              <h2>{editandoId ? 'Editar insumo' : 'Novo insumo'}</h2>
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
                  onChange={(e) => atualizarCampo('nome', e.target.value)}
                  placeholder="Ex.: Embalagem 250g"
                />
                {erros.nome && <span className="campo-erro">{erros.nome}</span>}
              </label>

              <div className="kx-form-linha">
                <label className="campo">
                  <span className="campo-label">Unidade</span>
                  <select
                    value={form.unidade}
                    onChange={(e) => atualizarCampo('unidade', e.target.value)}
                  >
                    {UNIDADES.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="campo">
                  <span className="campo-label">Estoque mínimo</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.estoqueMinimo}
                    onChange={(e) => atualizarCampo('estoqueMinimo', e.target.value)}
                    placeholder="0"
                  />
                  {erros.estoqueMinimo && (
                    <span className="campo-erro">{erros.estoqueMinimo}</span>
                  )}
                </label>
              </div>

              <label className="campo">
                <span className="campo-label">Descrição</span>
                <textarea
                  rows={2}
                  value={form.descricao}
                  onChange={(e) => atualizarCampo('descricao', e.target.value)}
                  placeholder="Opcional"
                />
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
