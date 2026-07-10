import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../utils/auth'
import './Login.css'

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

export default function Login() {
  const navigate = useNavigate()
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    setErro('')
    if (usuario.trim() === 'admin' && senha === 'admin') {
      login('admin')
      navigate('/dashboard')
    } else {
      setErro('Usuário ou senha inválidos. Use admin / admin.')
    }
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

        <h2 className="login-titulo">Acesso ao sistema</h2>
        <p className="login-descricao">Entre com suas credenciais para continuar.</p>

        <form onSubmit={handleSubmit} className="login-form">
          <label className="campo">
            <span className="campo-label">Usuário</span>
            <input
              type="text"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="admin"
              autoFocus
            />
          </label>

          <label className="campo">
            <span className="campo-label">Senha</span>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••"
            />
          </label>

          {erro && <div className="login-erro">{erro}</div>}

          <button type="submit" className="btn btn-primary login-botao">
            Entrar
          </button>
        </form>

        <p className="login-dica">Dica: usuário <strong>admin</strong> · senha <strong>admin</strong></p>
      </div>

      <p className="login-rodape">© {new Date().getFullYear()} Café do Brás — Gestão interna</p>
    </div>
  )
}
