/**
 * Resolves a free-text country name in Portuguese to an ISO 3166-1 alpha-2 code.
 *
 * Single source of truth for label → code. `scripts/migrate-livros.ts` maps the
 * frozen 86-record corpus through this; `AddBookForm.vue` maps whatever a member
 * types. Matching is case- and accent-insensitive, so "Rússia", "russia" and
 * "RUSSIA" all resolve to "RU".
 *
 * Unknown labels (e.g. "Roma Antiga", which has no ISO code) resolve to null.
 * Callers persist the raw label in that case — it is what the product renders
 * via `formatCountryName`, and the reading map lists it as unmapped rather
 * than dropping it.
 */
const COUNTRY_LABEL_TO_CODE: Record<string, string> = {
  // Américas
  'brasil': 'BR',
  'eua': 'US',
  'usa': 'US',
  'estados unidos': 'US',
  'canada': 'CA',
  'mexico': 'MX',
  'cuba': 'CU',
  'argentina': 'AR',
  'chile': 'CL',
  'colombia': 'CO',
  'peru': 'PE',
  'uruguai': 'UY',
  'paraguai': 'PY',
  // Europa
  'portugal': 'PT',
  'espanha': 'ES',
  'franca': 'FR',
  'reino unido': 'GB',
  'uk': 'GB',
  'inglaterra': 'GB',
  'irlanda': 'IE',
  'alemanha': 'DE',
  'holanda': 'NL',
  'paises baixos': 'NL',
  'belgica': 'BE',
  'suica': 'CH',
  'austria': 'AT',
  'italia': 'IT',
  'polonia': 'PL',
  'grecia': 'GR',
  'turquia': 'TR',
  'suecia': 'SE',
  'noruega': 'NO',
  'dinamarca': 'DK',
  'finlandia': 'FI',
  'hungria': 'HU',
  'romenia': 'RO',
  'ucrania': 'UA',
  'russia': 'RU',
  // Ásia e Oriente Médio
  'china': 'CN',
  'japao': 'JP',
  'coreia': 'KR',
  'coreia do sul': 'KR',
  'india': 'IN',
  'israel': 'IL',
  // África e Oceania
  'egito': 'EG',
  'nigeria': 'NG',
  'africa do sul': 'ZA',
  'australia': 'AU',
}

function normalizeCountryLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function resolveCountryCode(label: string): string | null {
  const key = normalizeCountryLabel(label)
  if (!key) return null
  return COUNTRY_LABEL_TO_CODE[key] ?? null
}
