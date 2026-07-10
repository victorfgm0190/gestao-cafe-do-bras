import { Routes, Route, Navigate } from 'react-router-dom'
import { estaLogado } from './utils/auth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ContasPagar from './pages/financeiro/ContasPagar'
import EstoqueIndex from './pages/estoque/EstoqueIndex'
import EntradaCafe from './pages/estoque/EntradaCafe'

function RotaProtegida({ children }) {
  if (!estaLogado()) {
    return <Navigate to="/" replace />
  }
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route
        path="/dashboard"
        element={
          <RotaProtegida>
            <Dashboard />
          </RotaProtegida>
        }
      />
      <Route
        path="/financeiro/contas-pagar"
        element={
          <RotaProtegida>
            <ContasPagar />
          </RotaProtegida>
        }
      />
      <Route
        path="/estoque"
        element={
          <RotaProtegida>
            <EstoqueIndex />
          </RotaProtegida>
        }
      />
      <Route
        path="/estoque/entrada-cafe"
        element={
          <RotaProtegida>
            <EntradaCafe />
          </RotaProtegida>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
