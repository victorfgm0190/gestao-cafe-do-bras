import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Topbar from '../../../components/Topbar'
import AbasPA from './AbasPA'
import { resumoProjecaoPA, formatarGramatura, pesoGramas } from '../../../utils/pa'
import '../CafeCru.css'
import './PA.css'

const fmtKg = (n) => `${(Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`

export default function PAProjecao() {
  const [itens, setItens] = useState([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const dados = await resumoProjecaoPA()
      if (vivo) {
        setItens(dados)
        setCarregando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [])

  // Achata cada produto em linhas por gramatura, ordenadas pelo peso.
  const linhas = useMemo(() => {
    const out = []
    for (const p of itens) {
      const chaves = [
        ...new Set([
          ...Object.keys(p.estoqueReal),
          ...Object.keys(p.projetadoAdicional),
          ...Object.keys(p.estoqueProjetado),
        ]),
      ].sort((a, b) => pesoGramas(a) - pesoGramas(b))
      chaves.forEach((k, i) => {
        out.push({
          paId: p.paId,
          nome: p.nome,
          gramatura: k,
          real: p.estoqueReal[k] || 0,
          adicional: p.projetadoAdicional[k] || 0,
          total: p.estoqueProjetado[k] || 0,
          primeira: i === 0,
          span: chaves.length,
          kgCru: p.kgCruDisponivel,
          kgTorrado: p.kgTorradoDisponivel,
        })
      })
    }
    return out
  }, [itens])

  return (
    <div className="pagina">
      <Topbar />
      <main className="conteudo">
        <div className="kx-breadcrumb">
          <Link to="/estoque" className="ec-link">
            Estoque
          </Link>{' '}
          · Produtos acabados · Projeção
        </div>

        <AbasPA />

        <div className="kx-cabecalho">
          <h1 className="kx-titulo">Estoque projetado</h1>
        </div>

        <p className="pa-proj-ajuda">
          Projeção do estoque considerando o café cru disponível convertido em torrado (descontada a perda
          de torra) e distribuído pelo <strong>mix de projeção</strong> de cada produto. A coluna{' '}
          <strong>Total projetado</strong> é o número a ser enviado ao site.
        </p>

        <div className="kx-tabela-wrap">
          <table className="kx-tabela">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Gramatura</th>
                <th className="kx-num">Estoque real</th>
                <th className="kx-num">+ Projetado</th>
                <th className="kx-num pa-proj-col">= Total projetado</th>
              </tr>
            </thead>
            <tbody>
              {!carregando && linhas.length === 0 && (
                <tr>
                  <td colSpan={5} className="kx-vazio">
                    Nenhum produto com mix de projeção definido. Configure o mix no cadastro do produto.
                  </td>
                </tr>
              )}
              {linhas.map((l) => (
                <tr key={`${l.paId}-${l.gramatura}`}>
                  {l.primeira && (
                    <td rowSpan={l.span} className="pa-proj-produto">
                      <span className="pa-proj-nome">{l.nome}</span>
                      <span className="pa-proj-cru">
                        {fmtKg(l.kgCru)} cru → {fmtKg(l.kgTorrado)} torrado
                      </span>
                    </td>
                  )}
                  <td>{formatarGramatura(l.gramatura)}</td>
                  <td className="kx-num">{l.real} pacotes</td>
                  <td className="kx-num pa-proj-add">{l.adicional > 0 ? `+${l.adicional}` : '—'}</td>
                  <td className="kx-num pa-proj-col">
                    <strong>{l.total}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
