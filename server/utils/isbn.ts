/**
 * ISBN normalisation.
 *
 * Every ISBN in the catalogue is stored as an ISBN-13. Of the 86 books in the
 * corpus, 64 carry an ISBN-13, 19 an ISBN-10 and 3 an Amazon ASIN, so the
 * 10 -> 13 path is routine and "not an ISBN at all" is a real case, not a
 * defensive one. A malformed ISBN is never stored: callers get null and decide.
 */

/** EAN-13 check digit for the first 12 digits. */
function ean13CheckDigit(first12: string): string {
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3)
  }
  return String((10 - (sum % 10)) % 10)
}

/** ISBN-10 check character for the first 9 digits ('X' means 10). */
function isbn10CheckDigit(first9: string): string {
  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += Number(first9[i]) * (10 - i)
  }
  const remainder = (11 - (sum % 11)) % 11
  return remainder === 10 ? 'X' : String(remainder)
}

/**
 * Normalise any ISBN spelling to a valid ISBN-13, or null.
 *
 * Accepts hyphens and spaces, and a trailing `.0` — a spreadsheet export read
 * the column as a float and wrote `9788598078397.0`.
 */
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
