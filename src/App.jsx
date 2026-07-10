import { Routes, Route, Navigate } from 'react-router-dom'
import { estaLogado } from './utils/auth'
import { usuarioLogado } from './utils/permissoes'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ContasPagar from './pages/financeiro/ContasPagar'
import EstoqueIndex from './pages/estoque/EstoqueIndex'
import EntradaCafe from './pages/estoque/EntradaCafe'
import KardexCafeCru from './pages/estoque/KardexCafeCru'
import SaldoCafeCru from './pages/estoque/SaldoCafeCru'
import InsumosCadastro from './pages/estoque/insumos/InsumosCadastro'
import InsumosEntrada from './pages/estoque/insumos/InsumosEntrada'
import InsumosKardex from './pages/estoque/insumos/InsumosKardex'
import InsumosSaldo from './pages/estoque/insumos/InsumosSaldo'
import TorradoEntrada from './pages/estoque/torrado/TorradoEntrada'
import TorradoKardex from './pages/estoque/torrado/TorradoKardex'
import TorradoSaldo from './pages/estoque/torrado/TorradoSaldo'
import PACadastro from './pages/estoque/pa/PACadastro'
import OrdemProducao from './pages/estoque/pa/OrdemProducao'
import PAEstoque from './pages/estoque/pa/PAEstoque'
import HistoricoProducao from './pages/estoque/pa/HistoricoProducao'
import EstoqueMinimo from './pages/configuracoes/EstoqueMinimo'
import AlertaEstoque from './components/AlertaEstoque'
import Usuarios from './pages/usuarios/Usuarios'
import Auditoria from './pages/auditoria/Auditoria'
import Bling from './pages/integracoes/Bling'
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
    <>
      <AlertaEstoque />
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
        path="/estoque/kardex"
        element={
          <RotaProtegida>
            <KardexCafeCru />
          </RotaProtegida>
        }
      />
      <Route
        path="/estoque/saldo"
        element={
          <RotaProtegida>
            <SaldoCafeCru />
          </RotaProtegida>
        }
      />
      <Route
        path="/estoque/insumos"
        element={
          <RotaProtegida>
            <InsumosCadastro />
          </RotaProtegida>
        }
      />
      <Route
        path="/estoque/insumos/entrada"
        element={
          <RotaProtegida>
            <InsumosEntrada />
          </RotaProtegida>
        }
      />
      <Route
        path="/estoque/insumos/kardex"
        element={
          <RotaProtegida>
            <InsumosKardex />
          </RotaProtegida>
        }
      />
      <Route
        path="/estoque/insumos/saldo"
        element={
          <RotaProtegida>
            <InsumosSaldo />
          </RotaProtegida>
        }
      />
      <Route
        path="/estoque/torrado"
        element={
          <RotaProtegida>
            <TorradoEntrada />
          </RotaProtegida>
        }
      />
      <Route
        path="/estoque/torrado/kardex"
        element={
          <RotaProtegida>
            <TorradoKardex />
          </RotaProtegida>
        }
      />
      <Route
        path="/estoque/torrado/saldo"
        element={
          <RotaProtegida>
            <TorradoSaldo />
          </RotaProtegida>
        }
      />
      <Route
        path="/estoque/pa"
        element={
          <RotaProtegida>
            <PACadastro />
          </RotaProtegida>
        }
      />
      <Route
        path="/estoque/pa/ordem"
        element={
          <RotaProtegida>
            <OrdemProducao />
          </RotaProtegida>
        }
      />
      <Route
        path="/estoque/pa/estoque"
        element={
          <RotaProtegida>
            <PAEstoque />
          </RotaProtegida>
        }
      />
      <Route
        path="/estoque/pa/historico"
        element={
          <RotaProtegida>
            <HistoricoProducao />
          </RotaProtegida>
        }
      />
      <Route
        path="/configuracoes/estoque-minimo"
        element={
          <RotaProtegida>
            <EstoqueMinimo />
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
      <Route
        path="/integracoes/bling"
        element={
          <RotaProtegida>
            <Bling />
          </RotaProtegida>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
