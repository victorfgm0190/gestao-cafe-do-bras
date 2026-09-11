// Regras de boleto que não dependem do banco. Arquivos começando com "_" NÃO
// viram rotas. Separado para poder ser testado sem conexão.

export const STATUS_BOLETO = ['SEM_VINCULO', 'VINCULADO', 'PAGO', 'CANCELADO']
export const MAX_PARCELAS = 120

// Aceita 1234.56, '1234.56', '1234,56' e '1.234,56'. Quando há vírgula, ela é
// o separador decimal e os pontos são de milhar — sem vírgula, o ponto é
// decimal. Assim '1.234,56' e '1234.56' funcionam sem ambiguidade.
export const num = (v) => {
  const t = String(v ?? '').trim()
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
}
// Arredonda para centavos sem depender de toFixed.
export const centavos = (v) => Math.round(v * 100) / 100

// null quando o campo não veio (num('') daria 0, não NaN — um campo ausente
// passaria como zero e cairia na mensagem de erro errada).
const informado = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : v)

// Valida e normaliza o corpo do POST /api/boletos.
// Retorna { erro } com a mensagem para o 400, ou os dados prontos para o INSERT.

export function montarBoleto(corpo = {}) {
  const fornecedor = String(corpo.fornecedor || '').trim()
  const valorBruto = informado(corpo.valorTotal ?? corpo.valor_total)
  const qtdBruto = informado(corpo.parcelasQuantidade ?? corpo.parcelas_quantidade)
  const observacoes = corpo.observacoes ? String(corpo.observacoes) : null
  const dataEntrada =
    corpo.dataEntrada || corpo.data_entrada || new Date().toISOString().slice(0, 10)

  if (!fornecedor || valorBruto === null || qtdBruto === null) {
    return { erro: 'Informe fornecedor, valorTotal e parcelasQuantidade.' }
  }

  const valorTotal = centavos(num(valorBruto))
  const qtd = Math.trunc(num(qtdBruto))
  if (!Number.isFinite(valorTotal) || !Number.isFinite(qtd)) {
    return { erro: 'valorTotal e parcelasQuantidade devem ser números.' }
  }
  if (valorTotal <= 0) return { erro: 'O valor total deve ser maior que zero.' }
  if (qtd <= 0) return { erro: 'A quantidade de parcelas deve ser maior que zero.' }
  if (qtd > MAX_PARCELAS) return { erro: `No máximo ${MAX_PARCELAS} parcelas.` }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dataEntrada))) {
    return { erro: 'dataEntrada deve estar no formato AAAA-MM-DD.' }
  }

  // Divisão em centavos: as primeiras parcelas levam o valor arredondado e a
  // última absorve a diferença, para a soma bater exatamente com o total.
  const valorParcela = centavos(valorTotal / qtd)
  const ultima = centavos(valorTotal - valorParcela * (qtd - 1))
  // valorParcela zera quando o total dividido arredonda para menos de um
  // centavo — daria parcelas de R$ 0,00.
  if (valorParcela <= 0 || ultima <= 0) {
    return { erro: 'Valor total baixo demais para esse número de parcelas.' }
  }

  return { fornecedor, dataEntrada, valorTotal, qtd, valorParcela, ultima, observacoes }
}
