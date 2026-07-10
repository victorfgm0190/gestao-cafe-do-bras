export function formatarMoeda(valor) {
  const numero = Number(valor) || 0
  return numero.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

// Recebe 'AAAA-MM-DD' e devolve 'DD/MM/AAAA'
export function formatarData(iso) {
  if (!iso) return '—'
  const [ano, mes, dia] = iso.split('-')
  if (!ano || !mes || !dia) return iso
  return `${dia}/${mes}/${ano}`
}

// Formata peso em kg com no máximo 2 casas decimais (ex.: '120 kg', '62,5 kg')
export function formatarKg(valor) {
  const numero = Number(valor) || 0
  return `${numero.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`
}

// Data de hoje no formato 'AAAA-MM-DD' (horário local)
export function hojeISO() {
  const d = new Date()
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}
