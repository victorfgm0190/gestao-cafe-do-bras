import { NavLink } from 'react-router-dom'
import '../CafeCru.css'

const ABAS = [
  { to: '/estoque/torrado', rotulo: 'Registrar Torra', exato: true },
  { to: '/estoque/torrado/kardex', rotulo: 'Kardex' },
  { to: '/estoque/torrado/saldo', rotulo: 'Saldo atual' },
]

// Barra de abas compartilhada pelas telas de café torrado (PP).
export default function AbasTorrado() {
  return (
    <nav className="cc-abas">
      {ABAS.map((a) => (
        <NavLink
          key={a.to}
          to={a.to}
          end={a.exato}
          className={({ isActive }) => `cc-aba ${isActive ? 'ativa' : ''}`}
        >
          {a.rotulo}
        </NavLink>
      ))}
    </nav>
  )
}
