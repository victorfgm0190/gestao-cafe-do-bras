import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usuarioLogado, atualizarSenha, nomeUsuarioAtual } from '../utils/permissoes'
import { registrarLog, ACOES } from '../utils/auditoria'
import './Login.css'
import './TrocarSenha.css'

function IconeCafe() {
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4Z" />
      <line x1="6" y1="1" x2="6" y2="4" />
      <line x1="10" y1="1" x2="10" y2="4" />
      <line x1="14" y1="1" x2="14" y2="4" />
    </svg>
  )
}

export default function TrocarSenha() {
  const navigate = useNavigate()
  const usuario = useMemo(() => usuarioLogado(), [])

  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [erro, setErro] = useState('')

  // Precisa estar logado para trocar a senha
  useEffect(() => {
    if (!usuario) navigate('/', { replace: true })
  }, [usuario, navigate])

  if (!usuario) return null

  const obrigatorio = usuario.primeiroAcesso === true

  function handleSubmit(e) {
    e.preventDefault()
    setErro('')

    if (senhaAtual !== usuario.senha) {
      setErro('Senha atual incorreta.')
      return
    }
    if (novaSenha.length < 6) {
      setErro('A nova senha deve ter no mínimo 6 caracteres.')
      return
    }
    if (novaSenha === senhaAtual) {
      setErro('A nova senha deve ser diferente da senha atual.')
      return
    }
    if (novaSenha !== confirmar) {
      setErro('A confirmação não confere com a nova senha.')
      return
    }

    atualizarSenha(usuario.id, novaSenha)
    registrarLog(nomeUsuarioAtual(), 'Usuários', ACOES.TROCOU_SENHA, 'Trocou a própria senha')
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">
            <IconeCafe />
          </div>
          <div>
            <h1 className="login-marca">Café do Brás</h1>
            <p className="login-sub">Microtorrefação · Londrina</p>
          </div>
        </div>

        <div className="login-divisor" />

        <h2 className="login-titulo">Trocar senha</h2>
        <p className="login-descricao">
          {obrigatorio
            ? 'Este é o seu primeiro acesso. Defina uma nova senha para continuar.'
            : `Atualize a senha da conta de ${usuario.nome}.`}
        </p>

        {obrigatorio && (
          <div className="ts-obrigatorio">
            🔒 A troca de senha é obrigatória no primeiro acesso.
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <label className="campo">
            <span className="campo-label">Senha atual</span>
            <input
              type="password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              placeholder={obrigatorio ? '123456' : '••••••'}
              autoFocus
            />
          </label>

          <label className="campo">
            <span className="campo-label">Nova senha</span>
            <input
              type="password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              placeholder="Mínimo 6 caracteres"
            />
          </label>

          <label className="campo">
            <span className="campo-label">Confirmar nova senha</span>
            <input
              type="password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              placeholder="Repita a nova senha"
            />
          </label>

          {erro && <div className="login-erro">{erro}</div>}

          <button type="submit" className="btn btn-primary login-botao">
            Salvar nova senha
          </button>
        </form>

        {!obrigatorio && (
          <button className="ts-voltar" onClick={() => navigate('/dashboard')}>
            ← Voltar ao painel
          </button>
        )}
      </div>

      <p className="login-rodape">© {new Date().getFullYear()} Café do Brás — Gestão interna</p>
    </div>
  )
}
