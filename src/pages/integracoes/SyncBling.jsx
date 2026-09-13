import { useState } from 'react'
import { getJson, sendJson } from '../../utils/api'
import './Bling.css'

// Sincronização de estoque PA × Bling. Push e pull SIMULAM por padrão: a
// chamada só escreve quando `confirmar: true` vai no corpo, e isso só acontece
// depois que você olha a prévia e clica em confirmar.
const ACOES = {
  mapa: {
    rotulo: '🗺️ Mapear variações',
    descricao:
      'Casa cada variação do Bling com (produto, gramatura). Sem esse mapa, o resto não sabe o que é "250g do Bourbon".',
  },
  divergencias: {
    rotulo: '🔍 Verificar divergências',
    descricao: 'Compara o saldo daqui com o do Bling. Só leitura: não escreve em lugar nenhum.',
  },
  push: {
    rotulo: '📤 Push de estoque',
    descricao: 'Manda o saldo daqui para o Bling. Mostra a prévia antes; só envia saldo, nunca preço ou nome.',
  },
  pull: {
    rotulo: '📥 Pull de vendas',
    descricao: 'Baixa do estoque as vendas do Bling. Mostra a prévia antes; cada pedido é baixado uma única vez.',
  },
}

export default function SyncBling({ conectado }) {
  const [ocupado, setOcupado] = useState('')
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState('')

  async function executar(acao, confirmar = false) {
    setOcupado(acao)
    setErro('')
    try {
      let dados
      if (acao === 'mapa') {
        dados = confirmar ? await sendJson('/api/bling/sync/mapa', 'POST') : await getJson('/api/bling/sync/mapa')
      } else if (acao === 'divergencias') {
        dados = await getJson('/api/bling/sync/divergencias')
      } else if (acao === 'push') {
        dados = await sendJson('/api/bling/sync/push-producao', 'POST', { confirmar })
      } else {
        dados = await sendJson('/api/bling/sync/pull-venda', 'POST', { confirmar })
      }
      setResultado({ acao, confirmar, dados })
    } catch (e) {
      setErro(e.message || 'Falha na sincronização.')
      setResultado(null)
    } finally {
      setOcupado('')
    }
  }

  // Há algo para confirmar? (push/pull em simulação, ou mapa em diagnóstico)
  function podeConfirmar() {
    if (!resultado) return false
    const { acao, dados } = resultado
    if (acao === 'mapa') return dados.gravado === false && (dados.mapeadas?.length || 0) > 0
    if (acao === 'push') return dados.simulacao === true && (dados.aEnviar?.length || 0) > 0
    if (acao === 'pull') return dados.simulacao === true && (dados.detalhes?.length || 0) > 0
    return false
  }

  function rotuloConfirmar() {
    const { acao, dados } = resultado
    if (acao === 'mapa') return `Gravar mapa de ${dados.mapeadas.length} variação(ões)`
    if (acao === 'push') return `Enviar ${dados.aEnviar.length} saldo(s) para o Bling`
    return `Baixar ${dados.detalhes.length} pedido(s) do estoque`
  }

  return (
    <>
      <h2 className="bl-secao">Sincronização de estoque (PA × Bling)</h2>
      <div className="bl-cards">
        {Object.entries(ACOES).map(([chave, a]) => (
          <div key={chave} className="bl-card">
            <div className="bl-card-icone">{a.rotulo.split(' ')[0]}</div>
            <h3>{a.rotulo.replace(/^\S+\s/, '')}</h3>
            <p>{a.descricao}</p>
            <button
              className="btn btn-secondary"
              onClick={() => executar(chave)}
              disabled={!conectado || Boolean(ocupado)}
            >
              {ocupado === chave ? 'Consultando...' : chave === 'divergencias' ? 'Verificar' : 'Simular'}
            </button>
          </div>
        ))}
      </div>

      {erro && <div className="bl-aviso erro">{erro}</div>}

      {resultado && (
        <div className="sync-resultado">
          <div className="sync-resultado-topo">
            <h3>{ACOES[resultado.acao].rotulo}</h3>
            <button className="bl-aviso-x" onClick={() => setResultado(null)} aria-label="Fechar">
              ✕
            </button>
          </div>

          {resultado.dados.mensagem && <p className="sync-mensagem">{resultado.dados.mensagem}</p>}

          <Resumo resultado={resultado} />

          {podeConfirmar() && (
            <div className="sync-acoes">
              <button
                className="btn btn-primary"
                onClick={() => executar(resultado.acao, true)}
                disabled={Boolean(ocupado)}
              >
                {ocupado ? 'Aplicando...' : rotuloConfirmar()}
              </button>
              <span className="campo-ajuda">
                Até aqui nada foi alterado. Este botão é o que aplica.
              </span>
            </div>
          )}

          <details className="sync-bruto">
            <summary>Resposta completa</summary>
            <pre>{JSON.stringify(resultado.dados, null, 2)}</pre>
          </details>
        </div>
      )}
    </>
  )
}

// Resumo legível por ação — o JSON cru fica no <details>.
function Resumo({ resultado }) {
  const { acao, dados } = resultado

  if (acao === 'mapa') {
    return (
      <>
        <ul className="sync-lista">
          <li>
            <strong>{dados.mapeadas?.length || 0}</strong> variação(ões) casada(s) com o catálogo
          </li>
          <li>
            <strong>{dados.naoReconhecidas?.length || 0}</strong> sem gramatura reconhecida no nome
          </li>
          <li>
            <strong>{dados.semProdutoLocal?.length || 0}</strong> sem produto correspondente aqui
          </li>
          <li>
            <strong>{dados.conflitos?.length || 0}</strong> conflito(s) — duas variações na mesma
            gramatura
          </li>
        </ul>
        {dados.naoReconhecidas?.length > 0 && (
          <Tabela
            titulo="Sem gramatura reconhecida"
            colunas={['Nome no Bling', 'Código']}
            linhas={dados.naoReconhecidas.map((v) => [v.nome, v.codigo || '—'])}
          />
        )}
      </>
    )
  }

  if (acao === 'divergencias') {
    return (
      <>
        <ul className="sync-lista">
          <li>
            <strong>{dados.comparados}</strong> combinação(ões) comparada(s)
          </li>
          <li>
            <strong>{dados.divergencias}</strong> com diferença ({dados.criticas} crítica(s))
          </li>
          <li>
            <strong>{dados.semMapa?.length || 0}</strong> sem mapa (não dá para comparar)
          </li>
        </ul>
        {dados.detalhes?.length > 0 && (
          <Tabela
            titulo="Divergências"
            colunas={['Produto', 'Gramatura', 'Aqui', 'Bling', 'Diferença']}
            linhas={dados.detalhes.map((d) => [
              d.paNome,
              d.gramatura,
              d.saldoLocal,
              d.saldoBling,
              d.diferenca,
            ])}
          />
        )}
      </>
    )
  }

  if (acao === 'push') {
    const lista = dados.simulacao ? dados.aEnviar : dados.detalhes
    return (
      <>
        {lista?.length > 0 && (
          <Tabela
            titulo={dados.simulacao ? 'Seriam enviados' : 'Enviados'}
            colunas={['Produto', 'Gramatura', 'Bling hoje', 'Passa a ser']}
            linhas={lista.map((d) => [d.paNome, d.gramatura, d.saldoBling ?? '—', d.saldoLocal])}
          />
        )}
        {dados.erros?.length > 0 && (
          <Tabela
            titulo="Com erro"
            colunas={['Produto', 'Gramatura', 'Erro']}
            linhas={dados.erros.map((d) => [d.paNome, d.gramatura, d.erro])}
          />
        )}
      </>
    )
  }

  // pull
  const linhas = (dados.detalhes || []).flatMap((p) =>
    p.baixas.map((b) => [p.numero ?? p.pedidoId, b.paNome, b.gramatura, b.quantidade]),
  )
  return (
    <>
      <ul className="sync-lista">
        <li>
          Período: <strong>{dados.periodo?.dataInicial}</strong> a{' '}
          <strong>{dados.periodo?.dataFinal}</strong>
        </li>
        <li>
          <strong>{dados.pedidosAAplicar ?? dados.pedidosAplicados ?? 0}</strong> pedido(s)
          {dados.pedidosJaProcessados != null && ` · ${dados.pedidosJaProcessados} já processado(s) antes`}
        </li>
        <li>
          <strong>{dados.naoMapeados?.length || 0}</strong> item(ns) sem produto correspondente
        </li>
      </ul>
      {linhas.length > 0 && (
        <Tabela
          titulo={dados.simulacao ? 'Baixas previstas' : 'Baixas aplicadas'}
          colunas={['Pedido', 'Produto', 'Gramatura', 'Unidades']}
          linhas={linhas}
        />
      )}
    </>
  )
}

function Tabela({ titulo, colunas, linhas }) {
  return (
    <div className="sync-tabela-wrap">
      <div className="sync-tabela-titulo">{titulo}</div>
      <table className="sync-tabela">
        <thead>
          <tr>
            {colunas.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.slice(0, 50).map((l, i) => (
            <tr key={i}>
              {l.map((celula, j) => (
                <td key={j}>{celula}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {linhas.length > 50 && (
        <p className="campo-ajuda">Mostrando 50 de {linhas.length} — o resto está na resposta completa.</p>
      )}
    </div>
  )
}
