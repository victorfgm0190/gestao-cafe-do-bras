import { NavLink } from 'react-router-dom'
import '../CafeCru.css'

const ABAS = [
  { to: '/estoque/insumos', rotulo: 'Cadastro', exato: true },
  { to: '/estoque/insumos/entrada', rotulo: 'Entrada' },
  { to: '/estoque/insumos/kardex', rotulo: 'Kardex' },
  { to: '/estoque/insumos/saldo', rotulo: 'Saldo' },
]

// Barra de abas compartilhada pelas telas de insumos.
export default function AbasInsumos() {
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
