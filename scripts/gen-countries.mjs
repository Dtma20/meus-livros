import fs from 'node:fs'

const CODES =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO ' +
  'FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE ' +
  'JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO ' +
  'MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW ' +
  'PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM ' +
  'TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'

const OVERRIDES = {
  HK: 'Hong Kong',
  MO: 'Macau',
  PS: 'Palestina',
  FK: 'Ilhas Malvinas',
  VA: 'Vaticano',
  KP: 'Coreia do Norte',
  KR: 'Coreia do Sul',
  CD: 'Congo (Kinshasa)',
  CG: 'Congo (Brazzaville)',
}

const display = new Intl.DisplayNames(['pt-BR'], { type: 'region' })

const entries = CODES.split(' ')
  .map((code) => [code, OVERRIDES[code] ?? display.of(code) ?? code])
  .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))

const body = entries.map(([code, label]) => `  { code: '${code}', label: '${label.replace(/'/g, "\\'")}' },`).join('\n')

const file = `/**

export interface CountryOption {
  code: string
  label: string
}

export const COUNTRIES: readonly CountryOption[] = [
${body}
]

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c.label]))

function foldCountryLabel(label: string): string {
  return label.trim().toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
}

const BY_LABEL = new Map(COUNTRIES.map((c) => [foldCountryLabel(c.label), c.code]))

const ALIASES: Record<string, string> = {
  'eua': 'US',
  'usa': 'US',
  'uk': 'GB',
  'inglaterra': 'GB',
  'holanda': 'NL',
  'coreia': 'KR',
}

export function countryLabelFor(code: string | null | undefined): string | null {
  if (!code) return null
  const upper = code.trim().toUpperCase()
  if (!upper) return null
  return BY_CODE.get(upper) ?? upper
}

export function countryCodeFor(label: string | null | undefined): string | null {
  if (!label) return null
  const trimmed = label.trim()
  if (!trimmed) return null

  const upper = trimmed.toUpperCase()
  if (BY_CODE.has(upper)) return upper

  const key = foldCountryLabel(trimmed)
  return BY_LABEL.get(key) ?? ALIASES[key] ?? null
}
`

fs.writeFileSync('shared/constants/countries.ts', file, 'utf8')
console.log('wrote shared/constants/countries.ts with', entries.length, 'countries')
