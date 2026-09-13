import { NavLink } from 'react-router-dom'
import '../estoque/CafeCru.css'

const ABAS = [
  { to: '/financeiro/contas-pagar', rotulo: 'Contas a pagar' },
  { to: '/financeiro/boletos', rotulo: 'Boletos' },
  { to: '/financeiro/vinculos', rotulo: 'Vínculos' },
]

// Barra de abas compartilhada pelas telas do financeiro.
export default function AbasFinanceiro() {
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
