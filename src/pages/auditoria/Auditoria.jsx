import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Topbar from '../../components/Topbar'
import { carregarLogs, registrarLog, ACOES } from '../../utils/auditoria'
import { ehMaster, nomeUsuarioAtual } from '../../utils/permissoes'
import { formatarData } from '../../utils/formato'
import './Auditoria.css'

function exportarCSV(logs) {
  const sep = ';'
  const cabecalho = ['Data', 'Hora', 'Usuário', 'Módulo', 'Ação', 'Detalhe']
  const escapar = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const linhas = [cabecalho.map(escapar).join(sep)]
  logs.forEach((l) => {
    linhas.push(
      [l.data, l.hora, l.usuario, l.modulo, l.acao, l.detalhe].map(escapar).join(sep),
    )
  })
  const csv = '﻿' + linhas.join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  a.href = url
  a.download = `auditoria_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function Auditoria() {
  const navigate = useNavigate()
  const [autorizado, setAutorizado] = useState(false)
  const [logs, setLogs] = useState([])
  const [fUsuario, setFUsuario] = useState('todos')
  const [fModulo, setFModulo] = useState('todos')
  const [fAcao, setFAcao] = useState('todas')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  // Somente Master acessa
  useEffect(() => {
    if (!ehMaster()) {
      navigate('/dashboard', { replace: true })
      return
    }
    setAutorizado(true)
    setLogs(carregarLogs())
  }, [navigate])

  const opcoesUsuario = useMemo(
    () => Array.from(new Set(logs.map((l) => l.usuario))).sort(),
    [logs],
  )
  const opcoesModulo = useMemo(
    () => Array.from(new Set(logs.map((l) => l.modulo))).sort(),
    [logs],
  )
  const opcoesAcao = useMemo(
    () => Array.from(new Set(logs.map((l) => l.acao))).sort(),
    [logs],
  )

  const logsFiltrados = useMemo(() => {
    return logs.filter((l) => {
      if (fUsuario !== 'todos' && l.usuario !== fUsuario) return false
      if (fModulo !== 'todos' && l.modulo !== fModulo) return false
      if (fAcao !== 'todas' && l.acao !== fAcao) return false
      if (dataInicio && l.data < dataInicio) return false
      if (dataFim && l.data > dataFim) return false
      return true
    })
  }, [logs, fUsuario, fModulo, fAcao, dataInicio, dataFim])

  function handleExportar() {
    if (logsFiltrados.length === 0) return
    exportarCSV(logsFiltrados)
    registrarLog(
      nomeUsuarioAtual(),
      'Auditoria',
      ACOES.EXPORTOU,
      `Exportou ${logsFiltrados.length} registro(s) de auditoria em CSV`,
    )
    setLogs(carregarLogs())
  }

  function limparFiltros() {
    setFUsuario('todos')
    setFModulo('todos')
    setFAcao('todas')
    setDataInicio('')
    setDataFim('')
  }

  if (!autorizado) return null

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="au-cabecalho">
          <div>
            <div className="au-breadcrumb">Administração · Log de auditoria</div>
            <h1 className="au-titulo">Log de auditoria</h1>
            <p className="au-subtitulo">
              Registro imutável de todas as operações relevantes do sistema.
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleExportar}
            disabled={logsFiltrados.length === 0}
          >
            ⬇ Exportar CSV
          </button>
        </div>

        {/* Filtros */}
        <div className="au-filtros">
          <select value={fUsuario} onChange={(e) => setFUsuario(e.target.value)}>
            <option value="todos">Todos os usuários</option>
            {opcoesUsuario.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <select value={fModulo} onChange={(e) => setFModulo(e.target.value)}>
            <option value="todos">Todos os módulos</option>
            {opcoesModulo.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select value={fAcao} onChange={(e) => setFAcao(e.target.value)}>
            <option value="todas">Todas as ações</option>
            {opcoesAcao.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <label className="au-periodo">
            <span>De</span>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
            />
          </label>
          <label className="au-periodo">
            <span>Até</span>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
            />
          </label>
          <button className="btn btn-ghost au-limpar" onClick={limparFiltros}>
            Limpar
          </button>
        </div>

        <div className="au-contagem">
          {logsFiltrados.length} registro{logsFiltrados.length === 1 ? '' : 's'} encontrado
          {logsFiltrados.length === 1 ? '' : 's'}
        </div>

        {/* Tabela */}
        <div className="au-tabela-wrap">
          <table className="au-tabela">
            <thead>
              <tr>
                <th>Data / hora</th>
                <th>Usuário</th>
                <th>Módulo</th>
                <th>Ação</th>
                <th>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {logsFiltrados.length === 0 && (
                <tr>
                  <td colSpan={5} className="au-vazio">
                    Nenhum registro encontrado com os filtros atuais.
                  </td>
                </tr>
              )}
              {logsFiltrados.map((l) => (
                <tr key={l.id}>
                  <td className="au-datahora">
                    <div className="au-data">{formatarData(l.data)}</div>
                    <div className="au-hora">{l.hora}</div>
                  </td>
                  <td className="au-usuario">{l.usuario}</td>
                  <td>
                    <span className="au-modulo">{l.modulo}</span>
                  </td>
                  <td>
                    <span className="au-acao">{l.acao}</span>
                  </td>
                  <td className="au-detalhe">{l.detalhe || <span className="au-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
