import { useState } from 'react'
import {
  LISTA_PERFIS,
  MODULOS,
  PERMISSOES,
  PERFIS,
  permissoesPadrao,
} from '../../utils/permissoes'
import './NovoUsuario.css'

function estadoInicial(usuario) {
  if (usuario) {
    return {
      nome: usuario.nome || '',
      email: usuario.email || '',
      telefone: usuario.telefone || '',
      status: usuario.status || 'ativo',
      perfil: usuario.perfil || PERFIS.CONSULTA,
      permissoes: usuario.permissoes || permissoesPadrao(usuario.perfil),
    }
  }
  return {
    nome: '',
    email: '',
    telefone: '',
    status: 'ativo',
    perfil: PERFIS.CONSULTA,
    permissoes: permissoesPadrao(PERFIS.CONSULTA),
  }
}

export default function NovoUsuario({ usuario, onSalvar, onFechar }) {
  const editando = Boolean(usuario)
  const [form, setForm] = useState(() => estadoInicial(usuario))
  const [erros, setErros] = useState({})

  function atualizarCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  // Ao trocar o perfil, preenche as permissões padrão (ainda ajustáveis).
  function trocarPerfil(perfil) {
    setForm((f) => ({ ...f, perfil, permissoes: permissoesPadrao(perfil) }))
  }

  function alternarPermissao(modulo, chave) {
    setForm((f) => ({
      ...f,
      permissoes: {
        ...f.permissoes,
        [modulo]: { ...f.permissoes[modulo], [chave]: !f.permissoes[modulo][chave] },
      },
    }))
  }

  function validar() {
    const e = {}
    if (!form.nome.trim()) e.nome = 'Informe o nome completo.'
    // E-mail é opcional; se preenchido, precisa ser válido.
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      e.email = 'E-mail inválido.'
    if (!form.perfil) e.perfil = 'Selecione um perfil.'
    setErros(e)
    return Object.keys(e).length === 0
  }

  function salvar(e) {
    e.preventDefault()
    if (!validar()) return
    onSalvar({
      nome: form.nome.trim(),
      email: form.email.trim(),
      telefone: form.telefone.trim(),
      status: form.status,
      perfil: form.perfil,
      permissoes: form.permissoes,
    })
  }

  return (
    <div className="nu-overlay" onMouseDown={onFechar}>
      <div className="nu-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="nu-modal-topo">
          <h2>{editando ? 'Editar usuário' : 'Novo usuário'}</h2>
          <button className="nu-fechar" onClick={onFechar} aria-label="Fechar">
            ✕
          </button>
        </div>

        <form onSubmit={salvar} className="nu-form">
          <div className="nu-secao">
            <h3 className="nu-secao-titulo">Dados do usuário</h3>

            <label className="campo">
              <span className="campo-label">
                Nome completo <span className="obrig">*</span>
              </span>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => atualizarCampo('nome', e.target.value)}
                placeholder="Ex.: Maria Oliveira"
              />
              {erros.nome && <span className="campo-erro">{erros.nome}</span>}
            </label>

            <div className="nu-form-linha">
              <label className="campo">
                <span className="campo-label">
                  E-mail <span className="campo-ajuda-inline">(opcional)</span>
                </span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => atualizarCampo('email', e.target.value)}
                  placeholder="nome@cafedobras.com.br"
                />
                {erros.email && <span className="campo-erro">{erros.email}</span>}
              </label>

              <label className="campo">
                <span className="campo-label">Telefone</span>
                <input
                  type="text"
                  value={form.telefone}
                  onChange={(e) => atualizarCampo('telefone', e.target.value)}
                  placeholder="(00) 00000-0000"
                />
              </label>
            </div>

            <label className="campo">
              <span className="campo-label">Status</span>
              <select
                value={form.status}
                onChange={(e) => atualizarCampo('status', e.target.value)}
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </label>

            {!editando && (
              <div className="nu-aviso-senha">
                🔑 Senha padrão: <strong>123456</strong> — o usuário deverá trocá-la no
                primeiro acesso.
              </div>
            )}
          </div>

          <div className="nu-secao">
            <h3 className="nu-secao-titulo">Perfil de acesso</h3>
            <label className="campo">
              <span className="campo-label">
                Perfil <span className="obrig">*</span>
              </span>
              <select
                value={form.perfil}
                onChange={(e) => trocarPerfil(e.target.value)}
              >
                {LISTA_PERFIS.map((p) => (
                  <option key={p.chave} value={p.chave}>
                    {p.chave} — {p.descricao}
                  </option>
                ))}
              </select>
              {erros.perfil && <span className="campo-erro">{erros.perfil}</span>}
              <span className="campo-ajuda">
                Ao escolher um perfil, as permissões são preenchidas automaticamente e podem
                ser ajustadas individualmente abaixo.
              </span>
            </label>
          </div>

          <div className="nu-secao">
            <h3 className="nu-secao-titulo">Permissões por módulo</h3>
            <div className="nu-perm-wrap">
              <table className="nu-perm-tabela">
                <thead>
                  <tr>
                    <th className="nu-perm-modulo">Módulo</th>
                    {PERMISSOES.map((p) => (
                      <th key={p.chave} title={p.rotulo}>
                        {p.rotulo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MODULOS.map((m) => (
                    <tr key={m}>
                      <td className="nu-perm-modulo">{m}</td>
                      {PERMISSOES.map((p) => (
                        <td key={p.chave} className="nu-perm-check">
                          <input
                            type="checkbox"
                            checked={Boolean(form.permissoes[m]?.[p.chave])}
                            onChange={() => alternarPermissao(m, p.chave)}
                            aria-label={`${m} · ${p.rotulo}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="nu-form-acoes">
            <button type="button" className="btn btn-ghost" onClick={onFechar}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              {editando ? 'Salvar alterações' : 'Cadastrar usuário'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
