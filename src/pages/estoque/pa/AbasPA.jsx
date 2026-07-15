import { NavLink } from 'react-router-dom'
import '../CafeCru.css'

const ABAS = [
  { to: '/estoque/pa', rotulo: 'Produtos (PA)', exato: true },
  { to: '/estoque/pa/ordem', rotulo: 'Ordem de Produção' },
  { to: '/estoque/pa/estoque', rotulo: 'Estoque PA' },
  { to: '/estoque/pa/projecao', rotulo: 'Projeção' },
  { to: '/estoque/pa/historico', rotulo: 'Histórico' },
]

export default function AbasPA() {
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
