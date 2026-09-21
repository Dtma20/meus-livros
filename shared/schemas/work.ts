import { z } from 'zod'

/**
 * One definition, imported by both the form and the route. The server always
 * revalidates: client-side validation here is a convenience, never a gate.
 */

/**
 * A cover URL must parse and must be `https:`.
 *
 * This is what stops `javascript:alert(1)` reaching an `<img src>`. `data:` is
 * rejected too — the only data URI the product renders is the placeholder that
 * BookCover generates itself.
 */
/**
 * The one cover-URL rule, for the write path and both read paths.
 *
 * There were three, and all three disagreed: this schema required `https:`,
 * `BookCover.vue` also allowed `data:`, and `app/utils/entry.ts` — which feeds
 * the Open Graph image — also allowed `http:`, with a unit test asserting that
 * as intended. `security.md` §4 states one rule for all of them: "must parse as
 * a URL with an `https:` scheme. This blocks `javascript:` and `data:` in
 * `<img src>`." Three predicates for one documented rule means two of them are
 * wrong and nobody knows which.
 *
 * `data:` is not needed by the placeholder BookCover generates: that value is
 * returned straight to `<img src>` and never passes through here. The CSP does
 * allow `data:` in `img-src` for exactly that reason.
 */
export function isHttpsCoverUrl(url: string | null | undefined): boolean {
  if (typeof url !== 'string') return false
  const trimmed = url.trim()
  if (!trimmed) return false
  try {
    return new URL(trimmed).protocol === 'https:'
  }
  catch {
    return false
  }
}

export const coverUrlSchema = z
  .string()
  .max(2000)
  .refine(isHttpsCoverUrl, { message: 'A URL da capa precisa começar com https://' })

/**
 * Signed year. The corpus contains -500 (Esopo), so a positive-only check
 * would reject real data.
 */
export const publicationYearSchema = z
  .number()
  .int()
  .min(-3000, { message: 'Ano anterior a -3000.' })
  .max(2100, { message: 'Ano posterior a 2100.' })

export const editionInputSchema = z.object({
  // Free text on purpose: any ISBN spelling is accepted and normalised server
  // side, and a value that is not an ISBN at all becomes null rather than an error.
  isbn: z.string().max(40).nullish(),
  publisher: z.string().max(200).nullish(),
  page_count: z.number().int().positive().max(50000).nullish(),
  published_year: publicationYearSchema.nullish(),
  language: z.string().length(2).nullish(),
  cover_url: coverUrlSchema.nullish(),
  ol_cover_id: z.number().int().positive().nullish(),
})

export const authorInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  country_code: z.string().length(2).nullish(),
  country_label: z.string().max(100).nullish(),
})

export const workInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  authors: z.array(authorInputSchema).min(1).max(5),
  original_language: z.string().length(2).nullish(),
  first_published_year: publicationYearSchema.nullish(),
  series_name: z.string().max(200).nullish(),
  // Text, never numeric: '1-2' and '0.1' are real values in the corpus.
  series_number: z.string().max(20).nullish(),
  ol_work_key: z.string().max(100).nullish(),
  genre_ids: z.array(z.number().int()).max(10).default([]),
  edition: editionInputSchema.nullish(),
})

export type WorkInput = z.infer<typeof workInputSchema>
export type EditionInput = z.infer<typeof editionInputSchema>
export type AuthorInput = z.infer<typeof authorInputSchema>

/**
 * Formats publication year.
 * Real corpus contains negative years (e.g. -500 for Aesop/Sun Tzu).
 * Renders -500 as "500 a.C.", not "-500".
 */
export function formatPublicationYear(year: number | null | undefined): string | null {
  if (year === null || year === undefined) return null
  if (year < 0) return `${Math.abs(year)} a.C.`
  return String(year)
}

/**
 * Formats author country.
 * Prioritizes country_label (e.g. "Roma Antiga"), otherwise resolves ISO 3166-1 alpha-2.
 */
export function formatCountry(
  countryCode?: string | null,
  countryLabel?: string | null,
): string | null {
  if (countryLabel && countryLabel.trim() !== '') return countryLabel.trim()
  if (!countryCode || countryCode.trim() === '') return null
  const code = countryCode.trim().toUpperCase()
  try {
    const regionNames = new Intl.DisplayNames(['pt-BR'], { type: 'region' })
    return regionNames.of(code) ?? code
  } catch {
    return code
  }
}

/**
 * Formats language code (ISO 639-1) into Portuguese name (e.g. 'en' -> 'Inglês').
 */
export function formatLanguage(languageCode?: string | null): string | null {
  if (!languageCode || languageCode.trim() === '') return null
  const code = languageCode.trim().toLowerCase()
  try {
    const langNames = new Intl.DisplayNames(['pt-BR'], { type: 'language' })
    const name = langNames.of(code)
    if (name) {
      return name.charAt(0).toUpperCase() + name.slice(1)
    }
    return code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

/**
 * The response contract for a work page (/livro/[slug]).
 * Lives in shared/ so app/ can type its useAsyncData call without importing server/.
 */
export interface WorkAuthorView {
  id: string
  name: string
  slug: string
  country_code: string | null
  country_label: string | null
}

export interface WorkGenreView {
  id: number
  slug: string
  label_pt: string
}

export interface WorkEditionView {
  id: string
  isbn13: string | null
  publisher: string | null
  page_count: number | null
  published_year: number | null
  language: string | null
  cover_url: string | null
  ol_cover_id: number | null
}

export interface WorkLogUserView {
  id: string
  handle: string
  display_name: string
}

export interface WorkLogView {
  id: string
  rating: number | null
  review: string | null
  finished_on: string | null
  created_at: Date | string
  user: WorkLogUserView
}

export interface WorkWithDetails {
  id: string
  slug: string
  title: string
  original_language: string | null
  first_published_year: number | null
  series_name: string | null
  series_number: string | null
  cover_url: string | null
  authors: WorkAuthorView[]
  genres: WorkGenreView[]
  editions: WorkEditionView[]
  logs: WorkLogView[]
  log_count: number
  average_rating: number | null
}

