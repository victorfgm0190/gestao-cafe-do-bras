import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Topbar from '../../components/Topbar'
import NovoUsuario from './NovoUsuario'
import { getJson, sendJson } from '../../utils/api'
import { MODULOS, PERMISSOES, ehMaster, nomeUsuarioAtual } from '../../utils/permissoes'
import { registrarLog, ACOES } from '../../utils/auditoria'
import './Usuarios.css'

// Timestamp do Postgres (Date ou 'AAAA-MM-DD HH:MM:SS') -> 'DD/MM/AAAA HH:MM'
function formatarAcesso(valor) {
  if (!valor) return 'Nunca acessou'
  const d = valor instanceof Date ? valor : new Date(String(valor).replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return String(valor)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function Usuarios() {
  const navigate = useNavigate()
  const [autorizado, setAutorizado] = useState(false)
  const [usuarios, setUsuarios] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [busca, setBusca] = useState('')
  const [modalForm, setModalForm] = useState(false)
  const [editando, setEditando] = useState(null)
  const [vendoPermissoes, setVendoPermissoes] = useState(null)
  const [trocandoSenha, setTrocandoSenha] = useState(null)
  const [novaSenha, setNovaSenha] = useState('')

  // Somente Master acessa este módulo (a API também exige — isto é só a UI)
  useEffect(() => {
    if (!ehMaster()) {
      navigate('/dashboard', { replace: true })
      return
    }
    setAutorizado(true)
    carregar()
  }, [navigate])

  async function carregar() {
    setCarregando(true)
    setErro('')
    try {
      const data = await getJson('/api/usuarios/listar')
      setUsuarios(data.usuarios || [])
    } catch (e) {
      setErro(e.message || 'Não foi possível carregar os usuários.')
    } finally {
      setCarregando(false)
    }
  }

  const usuariosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return usuarios
    return usuarios.filter((u) =>
      [u.nome, u.username, u.email, u.perfil].some((c) =>
        (c || '').toLowerCase().includes(termo),
      ),
    )
  }, [usuarios, busca])

  const resumo = useMemo(() => {
    const total = usuarios.length
    const ativos = usuarios.filter((u) => u.ativo).length
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

  async function salvarUsuario(dados) {
    setSalvando(true)
    try {
      const autor = nomeUsuarioAtual()
      if (editando) {
        // A senha não é coluna do editar: vai por trocar-senha, que também marca
        // primeiro_acesso. Campo em branco no formulário = manter a senha atual.
        const { senha, forcarTroca, ...campos } = dados
        await sendJson('/api/usuarios/editar', 'PUT', { id: editando.id, ...campos })
        registrarLog(autor, 'Usuários', ACOES.ALTEROU, `Alterou o usuário ${dados.nome}`)
        if (senha) {
          await sendJson('/api/usuarios/trocar-senha', 'POST', {
            usuarioId: editando.id,
            novaSenha: senha,
            forcarTroca: Boolean(forcarTroca),
          })
          registrarLog(
            autor,
            'Usuários',
            ACOES.TROCOU_SENHA,
            `Redefiniu a senha de ${dados.nome}${forcarTroca ? ' (troca obrigatória no próximo login)' : ''}`,
          )
        }
      } else {
        await sendJson('/api/usuarios/criar', 'POST', dados)
        registrarLog(autor, 'Usuários', ACOES.INCLUIU, `Cadastrou o usuário ${dados.nome}`)
      }
      fecharForm()
      await carregar()
    } catch (e) {
      window.alert(e.message || 'Não foi possível salvar o usuário.')
    } finally {
      setSalvando(false)
    }
  }

  async function alternarStatus(u) {
    try {
      await sendJson('/api/usuarios/editar', 'PUT', { id: u.id, ativo: !u.ativo })
      registrarLog(
        nomeUsuarioAtual(),
        'Usuários',
        ACOES.ALTEROU,
        `${u.ativo ? 'Inativou' : 'Ativou'} o usuário ${u.nome}`,
      )
      await carregar()
    } catch (e) {
      window.alert(e.message || 'Não foi possível alterar o status.')
    }
  }

  async function confirmarTrocaSenha() {
    if (novaSenha.length < 6) {
      window.alert('A senha precisa de ao menos 6 caracteres.')
      return
    }
    setSalvando(true)
    try {
      const r = await sendJson('/api/usuarios/trocar-senha', 'POST', {
        usuarioId: trocandoSenha.id,
        novaSenha,
      })
      registrarLog(
        nomeUsuarioAtual(),
        'Usuários',
        ACOES.TROCOU_SENHA,
        `Redefiniu a senha de ${trocandoSenha.nome}`,
      )
      setTrocandoSenha(null)
      setNovaSenha('')
      window.alert(r.mensagem || 'Senha redefinida.')
      await carregar()
    } catch (e) {
      window.alert(e.message || 'Não foi possível redefinir a senha.')
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(u) {
    if (u.protegido) {
      window.alert('O usuário administrador não pode ser excluído.')
      return
    }
    if (!window.confirm(`Excluir o usuário ${u.nome}? Esta ação não pode ser desfeita.`)) return
    try {
      await sendJson('/api/usuarios/excluir', 'DELETE', { id: u.id })
      registrarLog(nomeUsuarioAtual(), 'Usuários', ACOES.EXCLUIU, `Excluiu o usuário ${u.nome}`)
      await carregar()
    } catch (e) {
      window.alert(e.message || 'Não foi possível excluir o usuário.')
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

        {erro && <div className="us-erro">{erro}</div>}

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
              placeholder="Buscar por nome, login, e-mail ou perfil..."
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
                <th>Login</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Status</th>
                <th>Último acesso</th>
                <th className="col-acoes">Ações</th>
              </tr>
            </thead>
            <tbody>
              {carregando && (
                <tr>
                  <td colSpan={7} className="us-vazio">
                    Carregando usuários...
                  </td>
                </tr>
              )}
              {!carregando && usuariosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={7} className="us-vazio">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              )}
              {!carregando &&
                usuariosFiltrados.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="us-nome">
                        {u.nome}
                        {u.protegido && <span className="us-tag-admin">admin</span>}
                      </div>
                      {u.telefone && <div className="us-sub">{u.telefone}</div>}
                    </td>
                    <td>
                      <span className="us-login">{u.username}</span>
                      {u.primeiro_acesso && (
                        <div className="us-sub">troca de senha pendente</div>
                      )}
                    </td>
                    <td>{u.email || '—'}</td>
                    <td>
                      <span className="us-perfil">{u.perfil}</span>
                    </td>
                    <td>
                      <span className={`badge ${u.ativo ? 'badge-pago' : 'badge-cancelado'}`}>
                        {u.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="us-acesso">{formatarAcesso(u.ultimo_acesso)}</td>
                    <td className="col-acoes">
                      <div className="us-acoes">
                        <button className="us-acao" onClick={() => abrirEdicao(u)}>
                          ✎ Editar
                        </button>
                        <button className="us-acao" onClick={() => setVendoPermissoes(u)}>
                          🔑 Permissões
                        </button>
                        <button
                          className="us-acao"
                          onClick={() => {
                            setNovaSenha('')
                            setTrocandoSenha(u)
                          }}
                        >
                          🔒 Senha
                        </button>
                        <button className="us-acao" onClick={() => alternarStatus(u)}>
                          {u.ativo ? '⛔ Inativar' : '✓ Ativar'}
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
        <NovoUsuario
          usuario={editando}
          salvando={salvando}
          onSalvar={salvarUsuario}
          onFechar={fecharForm}
        />
      )}

      {/* Redefinição de senha pelo Master */}
      {trocandoSenha && (
        <div className="us-overlay" onMouseDown={() => setTrocandoSenha(null)}>
          <div className="us-modal-senha" onMouseDown={(e) => e.stopPropagation()}>
            <div className="us-modal-topo">
              <div>
                <h2>Redefinir senha</h2>
                <span className="us-modal-sub">{trocandoSenha.nome}</span>
              </div>
              <button
                className="us-fechar"
                onClick={() => setTrocandoSenha(null)}
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
            <label className="campo">
              <span className="campo-label">Nova senha</span>
              <input
                type="password"
                value={novaSenha}
                autoFocus
                autoComplete="new-password"
                placeholder="Ao menos 6 caracteres"
                onChange={(e) => setNovaSenha(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmarTrocaSenha()}
              />
              <span className="campo-ajuda">
                {trocandoSenha.nome} será obrigado a trocá-la no próximo login — você não
                precisa saber a senha definitiva dele.
              </span>
            </label>
            <div className="us-modal-acoes">
              <button className="btn btn-ghost" onClick={() => setTrocandoSenha(null)}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={confirmarTrocaSenha} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Redefinir senha'}
              </button>
            </div>
          </div>
        </div>
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
