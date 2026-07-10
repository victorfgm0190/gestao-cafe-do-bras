import { Routes, Route, Navigate } from 'react-router-dom'
import { estaLogado } from './utils/auth'
import { usuarioLogado } from './utils/permissoes'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ContasPagar from './pages/financeiro/ContasPagar'
import EstoqueIndex from './pages/estoque/EstoqueIndex'
import EntradaCafe from './pages/estoque/EntradaCafe'
import Usuarios from './pages/usuarios/Usuarios'
import Auditoria from './pages/auditoria/Auditoria'
import TrocarSenha from './pages/TrocarSenha'

function RotaProtegida({ children, permiteTrocaPendente = false }) {
  if (!estaLogado()) {
    return <Navigate to="/" replace />
  }
  // Enquanto a troca de senha do primeiro acesso estiver pendente,
  // bloqueia o acesso a qualquer outra tela.
  if (!permiteTrocaPendente && usuarioLogado()?.primeiroAcesso) {
    return <Navigate to="/trocar-senha" replace />
  }
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route
        path="/trocar-senha"
        element={
          <RotaProtegida permiteTrocaPendente>
            <TrocarSenha />
          </RotaProtegida>
        }
      />
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
      <Route
        path="/usuarios"
        element={
          <RotaProtegida>
            <Usuarios />
          </RotaProtegida>
        }
      />
      <Route
        path="/auditoria"
        element={
          <RotaProtegida>
            <Auditoria />
          </RotaProtegida>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
