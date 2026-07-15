import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Topbar from '../../components/Topbar'
import AbasCafeCru from './AbasCafeCru'
import { registrarLog, ACOES } from '../../utils/auditoria'
import { nomeUsuarioAtual } from '../../utils/permissoes'
import {
  carregarCafesCru,
  criarCafeCru,
  editarCafeCru,
  inativarCafeCru,
  PROCESSOS_CAFE,
  PROCESSO_PADRAO,
} from '../../utils/cafesCru'
import { carregarPA } from '../../utils/pa'
import './CafeCru.css'

const FORM_VAZIO = {
  fazenda: '',
  variedade: '',
  processo: PROCESSO_PADRAO,
  paIds: [],
  ativo: true,
}

export default function CafeCruCadastro() {
  const [cafes, setCafes] = useState([])
  const [pas, setPas] = useState([])
  const [modalAberto, setModalAberto] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [erros, setErros] = useState({})
  const [salvando, setSalvando] = useState(false)

  async function recarregar() {
    setCafes(await carregarCafesCru())
  }

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const [lista, listaPas] = await Promise.all([carregarCafesCru(), carregarPA()])
      if (vivo) {
        setCafes(lista)
        setPas(listaPas.filter((p) => p.ativo !== false))
      }
    })()
    return () => {
      vivo = false
    }
  }, [])

  const nomePa = useMemo(() => {
    const m = {}
    for (const p of pas) m[p.id] = p.nome
    return m
  }, [pas])

  function abrirNovo() {
    setEditandoId(null)
    setForm(FORM_VAZIO)
    setErros({})
    setModalAberto(true)
  }

  function abrirEdicao(cafe) {
    setEditandoId(cafe.id)
    setForm({
      fazenda: cafe.fazenda,
      variedade: cafe.variedade,
      processo: PROCESSOS_CAFE.includes(cafe.processo) ? cafe.processo : PROCESSO_PADRAO,
      paIds: [...(cafe.paIds || [])],
      ativo: cafe.ativo !== false,
    })
    setErros({})
    setModalAberto(true)
  }

  function togglePa(id) {
    setForm((f) => {
      const tem = f.paIds.includes(id)
      const paIds = tem ? f.paIds.filter((x) => x !== id) : [...f.paIds, id]
      return { ...f, paIds }
    })
  }

  function validar() {
    const e = {}
    if (!form.fazenda.trim()) e.fazenda = 'Informe a fazenda.'
    if (!form.variedade.trim()) e.variedade = 'Informe a variedade.'
    setErros(e)
    return Object.keys(e).length === 0
  }

  async function salvar(e) {
    e.preventDefault()
    if (!validar()) return

    const dados = {
      fazenda: form.fazenda.trim(),
      variedade: form.variedade.trim(),
      processo: form.processo,
      paIds: form.paIds,
      ativo: form.ativo,
    }

    const autor = nomeUsuarioAtual()
    setSalvando(true)
    try {
      if (editandoId) {
        await editarCafeCru(editandoId, dados)
        registrarLog(autor, 'Estoque MP', ACOES.ALTEROU, `Alterou o café ${dados.fazenda} — ${dados.variedade}`)
      } else {
        await criarCafeCru(dados)
        registrarLog(autor, 'Estoque MP', ACOES.INCLUIU, `Cadastrou o café ${dados.fazenda} — ${dados.variedade}`)
      }
      await recarregar()
      setModalAberto(false)
    } catch (err) {
      setErros((prev) => ({ ...prev, geral: err.message || 'Falha ao salvar o café.' }))
    } finally {
      setSalvando(false)
    }
  }

  async function inativar(cafe) {
    if (window.confirm(`Inativar o café ${cafe.fazenda} — ${cafe.variedade}?`)) {
      await inativarCafeCru(cafe.id)
      registrarLog(
        nomeUsuarioAtual(),
        'Estoque MP',
        ACOES.EXCLUIU,
        `Inativou o café ${cafe.fazenda} — ${cafe.variedade}`,
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
          · Café cru · Cafés (MP)
        </div>

        <AbasCafeCru />

        <div className="kx-cabecalho">
          <h1 className="kx-titulo">Cafés cadastrados (MP)</h1>
          <button className="btn btn-primary" onClick={abrirNovo}>
            + Novo café
          </button>
        </div>

        <div className="kx-tabela-wrap">
          <table className="kx-tabela">
            <thead>
              <tr>
                <th>Fazenda</th>
                <th>Variedade</th>
                <th>Processo</th>
                <th>Produtos vinculados</th>
                <th className="kx-num">Ações</th>
              </tr>
            </thead>
            <tbody>
              {cafes.length === 0 && (
                <tr>
                  <td colSpan={5} className="kx-vazio">
                    Nenhum café cadastrado. Cadastre a fazenda, variedade e processo.
                  </td>
                </tr>
              )}
              {cafes.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 700, color: 'var(--verde)' }}>{c.fazenda}</td>
                  <td>{c.variedade}</td>
                  <td>
                    <span className="badge badge-pago">{c.processo}</span>
                  </td>
                  <td>
                    {c.paIds.length === 0 ? (
                      <span className="cp-muted">—</span>
                    ) : (
                      <span className="ccc-vinculos">
                        {c.paIds.map((id) => nomePa[id] || `#${id}`).join(' · ')}
                      </span>
                    )}
                  </td>
                  <td className="kx-num">
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button className="kx-limpar" onClick={() => abrirEdicao(c)}>
                        ✎ Editar
                      </button>
                      <button className="kx-limpar" onClick={() => inativar(c)}>
                        🗑 Inativar
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
              <h2>{editandoId ? 'Editar café' : 'Novo café'}</h2>
              <button className="kx-fechar" onClick={() => setModalAberto(false)} aria-label="Fechar">
                ✕
              </button>
            </div>

            <form onSubmit={salvar} className="kx-form">
              <label className="campo">
                <span className="campo-label">
                  Fazenda <span className="obrig">*</span>
                </span>
                <input
                  type="text"
                  value={form.fazenda}
                  onChange={(e) => setForm((f) => ({ ...f, fazenda: e.target.value }))}
                  placeholder="Ex.: Fazenda Serra Verde"
                />
                {erros.fazenda && <span className="campo-erro">{erros.fazenda}</span>}
              </label>

              <div className="kx-form-linha">
                <label className="campo">
                  <span className="campo-label">
                    Variedade <span className="obrig">*</span>
                  </span>
                  <input
                    type="text"
                    value={form.variedade}
                    onChange={(e) => setForm((f) => ({ ...f, variedade: e.target.value }))}
                    placeholder="Ex.: Bourbon, Catuaí, Mundo Novo"
                  />
                  {erros.variedade && <span className="campo-erro">{erros.variedade}</span>}
                </label>
                <label className="campo">
                  <span className="campo-label">Processo</span>
                  <select
                    value={form.processo}
                    onChange={(e) => setForm((f) => ({ ...f, processo: e.target.value }))}
                  >
                    {PROCESSOS_CAFE.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="campo">
                <span className="campo-label">Produtos acabados vinculados (opcional)</span>
                {pas.length === 0 ? (
                  <span className="campo-ajuda">Nenhum produto acabado ativo cadastrado.</span>
                ) : (
                  <div className="ccc-pa-grupo">
                    {pas.map((p) => {
                      const marcado = form.paIds.includes(p.id)
                      return (
                        <label key={p.id} className={`ccc-pa-item ${marcado ? 'ativo' : ''}`}>
                          <input type="checkbox" checked={marcado} onChange={() => togglePa(p.id)} />
                          {p.nome}
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>

              <label className="ccc-check">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))}
                />
                Café ativo
              </label>

              {erros.geral && <div className="campo-erro">{erros.geral}</div>}
              <div className="kx-form-acoes">
                <button type="button" className="btn btn-ghost" onClick={() => setModalAberto(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={salvando}>
                  {salvando ? 'Salvando…' : editandoId ? 'Salvar alterações' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
