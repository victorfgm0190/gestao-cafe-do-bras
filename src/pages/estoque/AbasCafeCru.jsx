import { NavLink } from 'react-router-dom'
import './CafeCru.css'

const ABAS = [
  { to: '/estoque/entrada-cafe', rotulo: 'Entrada' },
  { to: '/estoque/kardex', rotulo: 'Kardex' },
  { to: '/estoque/saldo', rotulo: 'Saldo atual' },
]

// Barra de abas compartilhada pelas telas de café cru (MP).
export default function AbasCafeCru() {
  return (
    <nav className="cc-abas">
      {ABAS.map((a) => (
        <NavLink
          key={a.to}
          to={a.to}
          className={({ isActive }) => `cc-aba ${isActive ? 'ativa' : ''}`}
        >
          {a.rotulo}
        </NavLink>
      ))}
    </nav>
  )
}
