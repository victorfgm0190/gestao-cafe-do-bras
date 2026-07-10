import { useNavigate, Link } from 'react-router-dom'
import { getUsuario, logout } from '../utils/auth'
import './Topbar.css'

function IconeCafe() {
  return (
    <svg
      width="22"
      height="22"
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

export default function Topbar() {
  const navigate = useNavigate()
  const usuario = getUsuario()

  function handleSair() {
    logout()
    navigate('/')
  }

  return (
    <header className="topbar">
      <Link to="/dashboard" className="topbar-marca">
        <span className="topbar-icon">
          <IconeCafe />
        </span>
        <span className="topbar-nome">
          Café do Brás <span className="topbar-nome-sec">· Gestão</span>
        </span>
      </Link>

      <div className="topbar-direita">
        <span className="topbar-usuario">
          <span className="topbar-avatar">{(usuario?.usuario || '?').charAt(0).toUpperCase()}</span>
          <span className="topbar-usuario-nome">{usuario?.usuario || 'visitante'}</span>
        </span>
        <button className="btn btn-ghost topbar-sair" onClick={handleSair}>
          Sair
        </button>
      </div>
    </header>
  )
}
