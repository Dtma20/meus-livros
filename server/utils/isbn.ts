
function ean13CheckDigit(first12: string): string {
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3)
  }
  return String((10 - (sum % 10)) % 10)
}

function isbn10CheckDigit(first9: string): string {
  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += Number(first9[i]) * (10 - i)
  }
  const remainder = (11 - (sum % 11)) % 11
  return remainder === 10 ? 'X' : String(remainder)
}

export function normalizeIsbn(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null

  const cleaned = String(raw)
    .trim()
    .replace(/\.0+$/, '')
    .replace(/[-\s]/g, '')
    .toUpperCase()

  if (/^\d{9}[\dX]$/.test(cleaned)) {
    const body = cleaned.slice(0, 9)
    if (isbn10CheckDigit(body) !== cleaned[9]) return null
    const first12 = `978${body}`
    return first12 + ean13CheckDigit(first12)
  }

  if (/^\d{13}$/.test(cleaned)) {
    return ean13CheckDigit(cleaned.slice(0, 12)) === cleaned[12] ? cleaned : null
  }

  return null
}
