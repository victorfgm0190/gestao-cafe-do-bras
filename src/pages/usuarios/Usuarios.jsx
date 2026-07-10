import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Topbar from '../../components/Topbar'
import NovoUsuario from './NovoUsuario'
import {
  carregarUsuarios,
  salvarUsuarios,
  proximoIdUsuario,
  permissoesPadrao,
  MODULOS,
  PERMISSOES,
  ehMaster,
  nomeUsuarioAtual,
} from '../../utils/permissoes'
import { registrarLog, ACOES } from '../../utils/auditoria'
import './Usuarios.css'

// 'AAAA-MM-DD HH:MM' -> 'DD/MM/AAAA HH:MM'
function formatarAcesso(valor) {
  if (!valor) return 'Nunca acessou'
  const [data, hora = ''] = valor.split(' ')
  const [ano, mes, dia] = data.split('-')
  if (!ano || !mes || !dia) return valor
  return `${dia}/${mes}/${ano}${hora ? ' ' + hora : ''}`
}

export default function Usuarios() {
  const navigate = useNavigate()
  const [autorizado, setAutorizado] = useState(false)
  const [usuarios, setUsuarios] = useState([])
  const [busca, setBusca] = useState('')
  const [modalForm, setModalForm] = useState(false)
  const [editando, setEditando] = useState(null)
  const [vendoPermissoes, setVendoPermissoes] = useState(null)

  // Somente Master acessa este módulo
  useEffect(() => {
    if (!ehMaster()) {
      navigate('/dashboard', { replace: true })
      return
    }
    setAutorizado(true)
    setUsuarios(carregarUsuarios())
  }, [navigate])

  function persistir(lista) {
    setUsuarios(lista)
    salvarUsuarios(lista)
  }

  const usuariosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return usuarios
    return usuarios.filter(
      (u) =>
        u.nome.toLowerCase().includes(termo) ||
        u.email.toLowerCase().includes(termo) ||
        (u.perfil || '').toLowerCase().includes(termo),
    )
  }, [usuarios, busca])

  const resumo = useMemo(() => {
    const total = usuarios.length
    const ativos = usuarios.filter((u) => u.status === 'ativo').length
    return { total, ativos, inativos: total - ativos }
  }, [usuarios])

  function abrirNovo() {
    setEditando(null)
    setModalForm(true)
  }

  function abrirEdicao(u) {
    setEditando(u)
    setModalForm(true)
  }

  function fecharForm() {
    setModalForm(false)
    setEditando(null)
  }

  function salvarUsuario(dados) {
    const autor = nomeUsuarioAtual()
    if (editando) {
      const lista = usuarios.map((u) => {
        if (u.id !== editando.id) return u
        return {
          ...u,
          nome: dados.nome,
          email: dados.email,
          telefone: dados.telefone,
          senha: dados.senha ? dados.senha : u.senha, // vazio = mantém a atual
          status: dados.status,
          perfil: dados.perfil,
          permissoes: dados.permissoes,
        }
      })
      persistir(lista)
      registrarLog(autor, 'Usuários', ACOES.ALTEROU, `Alterou o usuário ${dados.nome}`)
    } else {
      const novo = {
        id: proximoIdUsuario(usuarios),
        nome: dados.nome,
        email: dados.email,
        telefone: dados.telefone,
        senha: dados.senha,
        status: dados.status,
        perfil: dados.perfil,
        permissoes: dados.permissoes || permissoesPadrao(dados.perfil),
        dataCriacao: new Date().toISOString().slice(0, 10),
        ultimoAcesso: null,
        protegido: false,
      }
      persistir([...usuarios, novo])
      registrarLog(autor, 'Usuários', ACOES.INCLUIU, `Cadastrou o usuário ${dados.nome}`)
    }
    fecharForm()
  }

  function alternarStatus(u) {
    const novoStatus = u.status === 'ativo' ? 'inativo' : 'ativo'
    persistir(usuarios.map((x) => (x.id === u.id ? { ...x, status: novoStatus } : x)))
    registrarLog(
      nomeUsuarioAtual(),
      'Usuários',
      ACOES.ALTEROU,
      `${novoStatus === 'ativo' ? 'Ativou' : 'Inativou'} o usuário ${u.nome}`,
    )
  }

  function excluir(u) {
    if (u.protegido) {
      window.alert('O usuário administrador não pode ser excluído.')
      return
    }
    if (window.confirm(`Excluir o usuário ${u.nome}? Esta ação não pode ser desfeita.`)) {
      persistir(usuarios.filter((x) => x.id !== u.id))
      registrarLog(nomeUsuarioAtual(), 'Usuários', ACOES.EXCLUIU, `Excluiu o usuário ${u.nome}`)
    }
  }

  if (!autorizado) return null

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="us-cabecalho">
          <div>
            <div className="us-breadcrumb">Administração · Usuários e permissões</div>
            <h1 className="us-titulo">Usuários e permissões</h1>
          </div>
          <button className="btn btn-primary" onClick={abrirNovo}>
            + Novo usuário
          </button>
        </div>

        {/* Cards de resumo */}
        <div className="us-cards">
          <div className="us-card">
            <span className="us-card-label">Total de usuários</span>
            <strong className="us-card-valor">{resumo.total}</strong>
            <span className="us-card-nota">Cadastrados no sistema</span>
          </div>
          <div className="us-card us-card-success">
            <span className="us-card-label">Ativos</span>
            <strong className="us-card-valor">{resumo.ativos}</strong>
            <span className="us-card-nota">Com acesso liberado</span>
          </div>
          <div className="us-card us-card-muted">
            <span className="us-card-label">Inativos</span>
            <strong className="us-card-valor">{resumo.inativos}</strong>
            <span className="us-card-nota">Acesso bloqueado</span>
          </div>
        </div>

        {/* Busca */}
        <div className="us-filtros">
          <div className="us-busca">
            <span className="us-busca-icone">🔍</span>
            <input
              type="text"
              placeholder="Buscar por nome, e-mail ou perfil..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>

        {/* Tabela */}
        <div className="us-tabela-wrap">
          <table className="us-tabela">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Status</th>
                <th>Último acesso</th>
                <th className="col-acoes">Ações</th>
              </tr>
            </thead>
            <tbody>
              {usuariosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={6} className="us-vazio">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              )}
              {usuariosFiltrados.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="us-nome">
                      {u.nome}
                      {u.protegido && <span className="us-tag-admin">admin</span>}
                    </div>
                    {u.telefone && <div className="us-sub">{u.telefone}</div>}
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <span className="us-perfil">{u.perfil}</span>
                  </td>
                  <td>
                    <span
                      className={`badge ${u.status === 'ativo' ? 'badge-pago' : 'badge-cancelado'}`}
                    >
                      {u.status === 'ativo' ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="us-acesso">{formatarAcesso(u.ultimoAcesso)}</td>
                  <td className="col-acoes">
                    <div className="us-acoes">
                      <button className="us-acao" onClick={() => abrirEdicao(u)}>
                        ✎ Editar
                      </button>
                      <button className="us-acao" onClick={() => setVendoPermissoes(u)}>
                        🔑 Permissões
                      </button>
                      <button className="us-acao" onClick={() => alternarStatus(u)}>
                        {u.status === 'ativo' ? '⛔ Inativar' : '✓ Ativar'}
                      </button>
                      <button
                        className="us-acao us-acao-excluir"
                        onClick={() => excluir(u)}
                        disabled={u.protegido}
                        title={u.protegido ? 'O admin não pode ser excluído' : 'Excluir'}
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

      {modalForm && (
        <NovoUsuario usuario={editando} onSalvar={salvarUsuario} onFechar={fecharForm} />
      )}

      {/* Visualização somente leitura das permissões */}
      {vendoPermissoes && (
        <div className="us-overlay" onMouseDown={() => setVendoPermissoes(null)}>
          <div className="us-modal-perm" onMouseDown={(e) => e.stopPropagation()}>
            <div className="us-modal-topo">
              <div>
                <h2>Permissões de {vendoPermissoes.nome}</h2>
                <span className="us-modal-sub">Perfil: {vendoPermissoes.perfil}</span>
              </div>
              <button
                className="us-fechar"
                onClick={() => setVendoPermissoes(null)}
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
            <div className="us-perm-view-wrap">
              <table className="us-perm-view">
                <thead>
                  <tr>
                    <th className="us-perm-modulo">Módulo</th>
                    {PERMISSOES.map((p) => (
                      <th key={p.chave}>{p.rotulo}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MODULOS.map((m) => {
                    const perm = vendoPermissoes.permissoes?.[m] || {}
                    return (
                      <tr key={m}>
                        <td className="us-perm-modulo">{m}</td>
                        {PERMISSOES.map((p) => (
                          <td key={p.chave} className="us-perm-cel">
                            {perm[p.chave] ? (
                              <span className="us-perm-sim">✓</span>
                            ) : (
                              <span className="us-perm-nao">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
