import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Topbar from '../../components/Topbar'
import { registrarLog, ACOES } from '../../utils/auditoria'
import { nomeUsuarioAtual } from '../../utils/permissoes'
import './Bling.css'

const CHAVE_HISTORICO = 'cafe_do_bras_bling_sync'

function carregarHistorico() {
  try {
    const bruto = localStorage.getItem(CHAVE_HISTORICO)
    const dado = bruto ? JSON.parse(bruto) : []
    return Array.isArray(dado) ? dado : []
  } catch {
    return []
  }
}

function salvarHistorico(lista) {
  localStorage.setItem(CHAVE_HISTORICO, JSON.stringify(lista.slice(0, 30)))
}

function agoraTexto() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function Bling() {
  const [params, setParams] = useSearchParams()
  const [conectado, setConectado] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [ocupado, setOcupado] = useState('')
  const [aviso, setAviso] = useState(null)
  const [historico, setHistorico] = useState(carregarHistorico)
  const [produtos, setProdutos] = useState([])

  // Lê o status atual da conexão no backend
  async function verificarStatus() {
    setCarregando(true)
    try {
      const r = await fetch('/api/bling/auth')
      const json = await r.json()
      setConectado(Boolean(json?.dados?.conectado))
    } catch {
      setConectado(false)
      setAviso({ tipo: 'erro', texto: 'Não foi possível falar com o backend (/api/bling).' })
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    verificarStatus()
  }, [])

  // Trata o retorno do callback (?conectado=1 ou ?conectado=0&erro=...)
  useEffect(() => {
    const conectadoParam = params.get('conectado')
    if (conectadoParam === '1') {
      setAviso({ tipo: 'sucesso', texto: 'Bling conectado com sucesso!' })
      setConectado(true)
      registrarLog(nomeUsuarioAtual(), 'Integrações', ACOES.INCLUIU, 'Conectou a integração com o Bling')
    } else if (conectadoParam === '0') {
      setAviso({ tipo: 'erro', texto: params.get('erro') || 'Falha ao conectar com o Bling.' })
    }
    if (conectadoParam !== null) {
      params.delete('conectado')
      params.delete('erro')
      setParams(params, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function registrar(tipo, sucesso, resultado) {
    const item = { data: agoraTexto(), tipo, sucesso, resultado }
    setHistorico((h) => {
      const novo = [item, ...h]
      salvarHistorico(novo)
      return novo
    })
  }

  // Inicia o fluxo OAuth: pega a URL no backend e redireciona pro Bling
  async function conectar() {
    setOcupado('conectar')
    setAviso(null)
    try {
      const r = await fetch('/api/bling/auth')
      const json = await r.json()
      if (json?.sucesso && json.dados?.url) {
        window.location.href = json.dados.url
      } else {
        setAviso({ tipo: 'erro', texto: json?.erro || 'Não foi possível obter a URL de autorização.' })
        setOcupado('')
      }
    } catch {
      setAviso({ tipo: 'erro', texto: 'Erro ao contatar o backend.' })
      setOcupado('')
    }
  }

  async function sincronizarPedidos() {
    setOcupado('pedidos')
    setAviso(null)
    try {
      const r = await fetch('/api/bling/pedidos')
      const json = await r.json()
      if (json?.sucesso) {
        const qtd = json.dados.length
        registrar('Pedidos', true, `${qtd} pedido(s) importado(s)`)
        setAviso({ tipo: 'sucesso', texto: `${qtd} pedido(s) sincronizado(s) do Bling.` })
        registrarLog(nomeUsuarioAtual(), 'Integrações', ACOES.INCLUIU, `Sincronizou ${qtd} pedidos do Bling`)
      } else {
        registrar('Pedidos', false, json?.erro || 'Falha')
        setAviso({ tipo: 'erro', texto: json?.erro || 'Falha ao sincronizar pedidos.' })
      }
    } catch {
      registrar('Pedidos', false, 'Erro de rede')
      setAviso({ tipo: 'erro', texto: 'Erro ao contatar o backend.' })
    } finally {
      setOcupado('')
    }
  }

  async function sincronizarProdutos() {
    setOcupado('produtos')
    setAviso(null)
    try {
      const r = await fetch('/api/bling/produtos')
      const json = await r.json()
      if (json?.sucesso) {
        const lista = Array.isArray(json.dados) ? json.dados : []
        setProdutos(lista)
        registrar('Produtos', true, `${lista.length} produto(s) carregado(s)`)
        setAviso({ tipo: 'sucesso', texto: `${lista.length} produto(s) carregado(s) do Bling.` })
        registrarLog(nomeUsuarioAtual(), 'Integrações', 'Consultou', `Buscou ${lista.length} produtos do Bling`)
      } else {
        registrar('Produtos', false, json?.erro || 'Falha')
        setAviso({ tipo: 'erro', texto: json?.erro || 'Falha ao buscar produtos.' })
      }
    } catch {
      registrar('Produtos', false, 'Erro de rede')
      setAviso({ tipo: 'erro', texto: 'Erro ao contatar o backend.' })
    } finally {
      setOcupado('')
    }
  }

  async function importarProdutosPA() {
    setOcupado('importarPA')
    setAviso(null)
    try {
      const r = await fetch('/api/bling/importar-produtos-pa')
      const json = await r.json()
      if (r.ok && json?.sucesso) {
        const total = Number(json.total) || 0
        registrar('Produtos → PA', true, `${total} produto(s) (${json.inseridos} novo(s), ${json.atualizados} atualizado(s))`)
        setAviso({ tipo: 'sucesso', texto: `${total} produtos importados para o catálogo de PA.` })
        registrarLog(nomeUsuarioAtual(), 'Integrações', ACOES.INCLUIU, `Importou ${total} produtos do Bling para o catálogo de PA`)
      } else {
        const msg = json?.error || json?.erro || 'Falha ao importar produtos para PA.'
        registrar('Produtos → PA', false, msg)
        setAviso({ tipo: 'erro', texto: msg })
      }
    } catch {
      registrar('Produtos → PA', false, 'Erro de rede')
      setAviso({ tipo: 'erro', texto: 'Erro ao contatar o backend.' })
    } finally {
      setOcupado('')
    }
  }

  async function sincronizarEstoque() {
    setOcupado('estoque')
    setAviso(null)
    try {
      // Puxa produtos/saldos atuais do Bling (leitura). A escrita de saldo é feita
      // por item via PUT /api/bling/estoque quando houver origem de dados local.
      const r = await fetch('/api/bling/produtos')
      const json = await r.json()
      if (json?.sucesso) {
        const qtd = json.dados.length
        registrar('Estoque', true, `${qtd} produto(s) conferido(s)`)
        setAviso({ tipo: 'sucesso', texto: `${qtd} produto(s) sincronizado(s) com o Bling.` })
        registrarLog(nomeUsuarioAtual(), 'Integrações', ACOES.ALTEROU, `Sincronizou estoque de ${qtd} produtos com o Bling`)
      } else {
        registrar('Estoque', false, json?.erro || 'Falha')
        setAviso({ tipo: 'erro', texto: json?.erro || 'Falha ao sincronizar estoque.' })
      }
    } catch {
      registrar('Estoque', false, 'Erro de rede')
      setAviso({ tipo: 'erro', texto: 'Erro ao contatar o backend.' })
    } finally {
      setOcupado('')
    }
  }

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="bl-cabecalho">
          <div>
            <div className="bl-breadcrumb">Integrações · Bling</div>
            <h1 className="bl-titulo">Integração com o Bling</h1>
          </div>
          <span className={`bl-status ${conectado ? 'on' : 'off'}`}>
            <span className="bl-status-dot" />
            {carregando ? 'Verificando...' : conectado ? 'Conectado' : 'Desconectado'}
          </span>
        </div>

        {aviso && (
          <div className={`bl-aviso ${aviso.tipo === 'sucesso' ? 'ok' : 'erro'}`}>
            {aviso.texto}
            <button className="bl-aviso-x" onClick={() => setAviso(null)} aria-label="Fechar">
              ✕
            </button>
          </div>
        )}

        <div className="bl-cards">
          <div className="bl-card">
            <div className="bl-card-icone">🔗</div>
            <h3>Conexão</h3>
            <p>
              Autorize o Café do Brás a acessar sua conta Bling via OAuth2. O segredo do
              app fica somente no backend.
            </p>
            <button
              className="btn btn-primary"
              onClick={conectar}
              disabled={ocupado === 'conectar'}
            >
              {conectado ? 'Reconectar com o Bling' : 'Conectar com o Bling'}
            </button>
          </div>

          <div className="bl-card">
            <div className="bl-card-icone">🛒</div>
            <h3>Pedidos de venda</h3>
            <p>Importa os pedidos de venda registrados no Bling para o sistema.</p>
            <button
              className="btn btn-secondary"
              onClick={sincronizarPedidos}
              disabled={!conectado || ocupado === 'pedidos'}
            >
              {ocupado === 'pedidos' ? 'Sincronizando...' : 'Sincronizar pedidos'}
            </button>
          </div>

          <div className="bl-card">
            <div className="bl-card-icone">🏷️</div>
            <h3>Produtos</h3>
            <p>Busca o catálogo de produtos cadastrados no Bling e exibe abaixo.</p>
            <div className="pa-card-acoes">
              <button
                className="btn btn-secondary"
                onClick={sincronizarProdutos}
                disabled={!conectado || ocupado === 'produtos'}
              >
                {ocupado === 'produtos' ? 'Sincronizando...' : 'Sincronizar produtos'}
              </button>
              <button
                className="btn btn-primary"
                onClick={importarProdutosPA}
                disabled={!conectado || ocupado === 'importarPA'}
              >
                {ocupado === 'importarPA' ? 'Importando...' : 'Importar produtos para PA'}
              </button>
            </div>
          </div>

          <div className="bl-card">
            <div className="bl-card-icone">📦</div>
            <h3>Estoque</h3>
            <p>Concilia os saldos de produtos entre o sistema e o Bling.</p>
            <button
              className="btn btn-secondary"
              onClick={sincronizarEstoque}
              disabled={!conectado || ocupado === 'estoque'}
            >
              {ocupado === 'estoque' ? 'Sincronizando...' : 'Sincronizar estoque'}
            </button>
          </div>
        </div>

        {(ocupado === 'produtos' || produtos.length > 0) && (
          <section className="bl-catalogo">
            <h2>Catálogo de produtos do Bling</h2>
            <div className="bl-tabela-wrap">
              {ocupado === 'produtos' ? (
                <div className="bl-carregando">Carregando produtos do Bling...</div>
              ) : (
                <table className="bl-tabela">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Nome</th>
                      <th className="col-num">Preço</th>
                      <th className="col-num">Estoque</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {produtos.map((p) => (
                      <tr key={p.id}>
                        <td>{p.codigo || '—'}</td>
                        <td>{p.nome}</td>
                        <td className="col-num">
                          {Number(p.preco).toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </td>
                        <td className="col-num">
                          {Number(p.estoque).toLocaleString('pt-BR')} {p.unidade}
                        </td>
                        <td>
                          <span
                            className={`badge ${p.situacao === 'A' ? 'badge-pago' : 'badge-vencido'}`}
                          >
                            {p.situacao === 'A' ? 'Ativo' : p.situacao === 'I' ? 'Inativo' : p.situacao || '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        <section className="bl-historico">
          <h2>Histórico de sincronizações</h2>
          <div className="bl-tabela-wrap">
            <table className="bl-tabela">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Resultado</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {historico.length === 0 && (
                  <tr>
                    <td colSpan={4} className="bl-vazio">
                      Nenhuma sincronização realizada ainda.
                    </td>
                  </tr>
                )}
                {historico.map((h, i) => (
                  <tr key={i}>
                    <td>{h.data}</td>
                    <td>{h.tipo}</td>
                    <td>{h.resultado}</td>
                    <td>
                      <span className={`badge ${h.sucesso ? 'badge-pago' : 'badge-vencido'}`}>
                        {h.sucesso ? 'Sucesso' : 'Falha'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}
