import { useMemo, useState } from 'react'
import { formatarMoeda, hojeISO } from '../../utils/formato'
import {
  MAX_PARCELAS,
  criarBoleto,
  dataISO,
  editarBoleto,
  num,
  previaParcelas,
} from '../../utils/boletos'
import '../estoque/CafeCru.css'
import './Boletos.css'

function formInicial(boleto) {
  if (!boleto) {
    return {
      fornecedor: '',
      dataEntrada: hojeISO(),
      valorTotal: '',
      parcelasQuantidade: '1',
      observacoes: '',
    }
  }
  return {
    fornecedor: boleto.fornecedor || '',
    dataEntrada: dataISO(boleto.data_entrada),
    valorTotal: Number(boleto.valor_total).toFixed(2).replace('.', ','),
    parcelasQuantidade: String(boleto.parcelas_quantidade),
    observacoes: boleto.observacoes || '',
  }
}

// Criação e edição de boleto. A validação definitiva é do backend
// (api/boletos/_lib.js); aqui só evitamos o roundtrip óbvio e mostramos a
// prévia de como o valor será dividido entre as parcelas.
export default function ModalBoleto({ boleto, aoFechar, aoSalvar }) {
  const editando = !!boleto
  const [form, setForm] = useState(() => formInicial(boleto))
  const [erros, setErros] = useState({})
  const [erroApi, setErroApi] = useState('')
  const [salvando, setSalvando] = useState(false)

  function campo(nome, valor) {
    setForm((f) => ({ ...f, [nome]: valor }))
    setErros((e) => ({ ...e, [nome]: undefined }))
  }

  const valor = num(form.valorTotal)
  const qtd = Math.trunc(num(form.parcelasQuantidade))
  const previa = useMemo(() => previaParcelas(valor, qtd), [valor, qtd])

  // Mexer em valor, quantidade ou data de entrada refaz as parcelas — e o
  // backend recusa (409) se alguma já estiver paga.
  const refazParcelas =
    editando &&
    (valor !== Number(boleto.valor_total) ||
      qtd !== Number(boleto.parcelas_quantidade) ||
      form.dataEntrada !== dataISO(boleto.data_entrada))

  function validar() {
    const e = {}
    if (!form.fornecedor.trim()) e.fornecedor = 'Informe o fornecedor.'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dataEntrada)) e.dataEntrada = 'Informe a data de entrada.'
    if (!Number.isFinite(valor) || valor <= 0) e.valorTotal = 'O valor deve ser maior que zero.'
    if (!Number.isFinite(qtd) || qtd <= 0) e.parcelasQuantidade = 'Informe ao menos 1 parcela.'
    else if (qtd > MAX_PARCELAS) e.parcelasQuantidade = `No máximo ${MAX_PARCELAS} parcelas.`
    else if (valor > 0 && !previa) {
      e.parcelasQuantidade = 'Valor baixo demais para esse número de parcelas.'
    }
    setErros(e)
    return Object.keys(e).length === 0
  }

  async function salvar(evento) {
    evento.preventDefault()
    if (!validar()) return
    setSalvando(true)
    setErroApi('')
    const corpo = {
      fornecedor: form.fornecedor.trim(),
      dataEntrada: form.dataEntrada,
      valorTotal: valor,
      parcelasQuantidade: qtd,
      observacoes: form.observacoes.trim() || null,
    }
    try {
      if (editando) {
        const r = await editarBoleto(boleto.id, corpo)
        aoSalvar(
          r.parcelasRefeitas
            ? `Boleto #${boleto.id} atualizado — parcelas refeitas.`
            : `Boleto #${boleto.id} atualizado.`,
        )
      } else {
        const r = await criarBoleto(corpo)
        aoSalvar(`Boleto #${r.boleto.id} criado com ${qtd} parcela(s).`)
      }
    } catch (e) {
      setErroApi(e.message || 'Falha ao salvar o boleto.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="kx-overlay" onMouseDown={aoFechar}>
      <div className="kx-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="kx-modal-topo">
          <h2>{editando ? `Editar boleto #${boleto.id}` : 'Novo boleto'}</h2>
          <button className="kx-fechar" onClick={aoFechar} aria-label="Fechar">
            ✕
          </button>
        </div>

        <form className="kx-form" onSubmit={salvar}>
          <label className="campo">
            <span className="campo-label">
              Fornecedor <span className="obrig">*</span>
            </span>
            <input
              value={form.fornecedor}
              onChange={(e) => campo('fornecedor', e.target.value)}
              placeholder="Ex.: Fazenda Serra Verde"
              autoFocus
            />
            {erros.fornecedor && <span className="campo-erro">{erros.fornecedor}</span>}
          </label>

          <div className="kx-form-linha">
            <label className="campo">
              <span className="campo-label">
                Data de entrada <span className="obrig">*</span>
              </span>
              <input
                type="date"
                value={form.dataEntrada}
                onChange={(e) => campo('dataEntrada', e.target.value)}
              />
              {erros.dataEntrada && <span className="campo-erro">{erros.dataEntrada}</span>}
            </label>

            <label className="campo">
              <span className="campo-label">
                Valor total (R$) <span className="obrig">*</span>
              </span>
              <input
                value={form.valorTotal}
                onChange={(e) => campo('valorTotal', e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
              />
              {erros.valorTotal && <span className="campo-erro">{erros.valorTotal}</span>}
            </label>
          </div>

          <label className="campo">
            <span className="campo-label">
              Parcelas <span className="obrig">*</span>
            </span>
            <input
              type="number"
              min="1"
              max={MAX_PARCELAS}
              value={form.parcelasQuantidade}
              onChange={(e) => campo('parcelasQuantidade', e.target.value)}
            />
            {erros.parcelasQuantidade && (
              <span className="campo-erro">{erros.parcelasQuantidade}</span>
            )}
          </label>

          {previa && (
            <div className="bo-previa">
              {previa.iguais ? (
                <>
                  {qtd}x de <strong>{formatarMoeda(previa.valorParcela)}</strong>
                </>
              ) : (
                <>
                  {qtd - 1}x de <strong>{formatarMoeda(previa.valorParcela)}</strong> + última de{' '}
                  <strong>{formatarMoeda(previa.ultima)}</strong>
                </>
              )}
              <br />
              Primeiro vencimento um mês após a data de entrada; a última parcela absorve a
              diferença de centavos.
            </div>
          )}

          <label className="campo">
            <span className="campo-label">Observações</span>
            <textarea
              rows={3}
              value={form.observacoes}
              onChange={(e) => campo('observacoes', e.target.value)}
              placeholder="Nota fiscal, condições combinadas..."
            />
          </label>

          {refazParcelas && (
            <p className="campo-ajuda">
              Valor, quantidade ou data de entrada mudaram: as parcelas serão refeitas. Se alguma
              já estiver paga, a edição é recusada.
            </p>
          )}

          {/* O PUT não refaz a cascata: o lote continuaria com o custo derivado
              do valor antigo. Só desfazer e refazer o vínculo corrige isso. */}
          {editando && boleto.status === 'VINCULADO' && valor !== Number(boleto.valor_total) && (
            <div className="bo-msg erro">
              Este boleto já está vinculado a um lote. Mudar o valor <strong>não</strong> recalcula
              o custo do lote nem do estoque — desfaça o vínculo na aba Vínculos e refaça depois de
              salvar.
            </div>
          )}

          {erroApi && <div className="bo-msg erro">{erroApi}</div>}

          <div className="kx-form-acoes">
            <button type="button" className="btn btn-ghost" onClick={aoFechar} disabled={salvando}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Criar boleto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
