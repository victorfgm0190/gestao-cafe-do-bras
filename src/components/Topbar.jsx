import { useEffect, useRef, useState } from 'react'
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
  const [menuAberto, setMenuAberto] = useState(false)
  const menuRef = useRef(null)

  // Fecha o menu ao clicar fora
  useEffect(() => {
    function aoClicarFora(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuAberto(false)
      }
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [])

  function handleSair() {
    logout()
    navigate('/')
  }

  function handleTrocarSenha() {
    setMenuAberto(false)
    navigate('/trocar-senha')
  }

  function handleEstoqueMinimo() {
    setMenuAberto(false)
    navigate('/configuracoes/estoque-minimo')
  }

  const nome = usuario?.usuario || 'visitante'

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

      <div className="topbar-direita" ref={menuRef}>
        <button
          className="topbar-usuario"
          onClick={() => setMenuAberto((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuAberto}
        >
          <span className="topbar-avatar">{nome.charAt(0).toUpperCase()}</span>
          <span className="topbar-usuario-nome">{nome}</span>
          <span className={`topbar-caret ${menuAberto ? 'aberto' : ''}`}>▾</span>
        </button>

        {menuAberto && (
          <div className="topbar-menu" role="menu">
            <button className="topbar-menu-item" role="menuitem" onClick={handleTrocarSenha}>
              🔑 Trocar senha
            </button>
            <button className="topbar-menu-item" role="menuitem" onClick={handleEstoqueMinimo}>
              ⚙️ Estoque mínimo
            </button>
            <button
              className="topbar-menu-item topbar-menu-sair"
              role="menuitem"
              onClick={handleSair}
            >
              ⏻ Sair
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
