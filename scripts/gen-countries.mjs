import fs from 'node:fs'

const CODES =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO ' +
  'FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE ' +
  'JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO ' +
  'MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW ' +
  'PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM ' +
  'TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'

// Node's ICU spells a handful of these in ways that read badly in a form, and
// Chrome's ICU spells them differently again — which is the whole reason this
// table is being frozen. These win over whatever the generating runtime said.
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
 * ISO 3166-1 alpha-2 countries, labelled in pt-BR.
 *
 * **Frozen on purpose. Do not rebuild this from \`Intl.DisplayNames\` at runtime.**
 *
 * The first version of this file did exactly that, and it broke hydration: Node's
 * ICU and Chrome's ICU disagree on several pt-BR region names — Node says
 * "Hong Kong, RAE da China" where Chrome says "Hong Kong", "Macau, RAE da China"
 * against "Macau", "Territórios palestinos" against "Palestina". Different labels
 * sort differently, so the server and the client rendered the 249 \`<option>\`
 * elements in different orders and every one of them mismatched. A table that
 * changes with the runtime's ICU version is also a table \`countryCodeFor\` cannot
 * resolve reliably.
 *
 * Codes are what gets stored: \`authors.country_code\` is \`char(2)\` and the reading
 * map keys on it. \`authors.country_label\` stays free text alongside this list —
 * the corpus contains 'Roma Antiga', which has no ISO code and never will.
 *
 * Sorted by label in pt-BR. Regenerate with \`gen-countries.mjs\` only if the list
 * of countries itself changes, never to re-derive the spellings.
 */

export interface CountryOption {
  code: string
  label: string
}

export const COUNTRIES: readonly CountryOption[] = [
${body}
]

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c.label]))
const BY_LABEL = new Map(COUNTRIES.map((c) => [c.label.toLowerCase(), c.code]))

/** The label for a code, or the code itself when it is not one we know. */
export function countryLabelFor(code: string | null | undefined): string | null {
  if (!code) return null
  const upper = code.trim().toUpperCase()
  if (!upper) return null
  return BY_CODE.get(upper) ?? upper
}

/**
 * The ISO code for a country typed by hand, or null when there is none.
 *
 * Null is a legitimate answer, not a failure: 'Roma Antiga' is a real value in
 * the corpus and is meant to survive as a label without a code.
 */
export function countryCodeFor(label: string | null | undefined): string | null {
  if (!label) return null
  const trimmed = label.trim()
  if (!trimmed) return null

  const upper = trimmed.toUpperCase()
  if (BY_CODE.has(upper)) return upper

  return BY_LABEL.get(trimmed.toLowerCase()) ?? null
}
`

fs.writeFileSync('shared/constants/countries.ts', file, 'utf8')
console.log('wrote shared/constants/countries.ts with', entries.length, 'countries')
