import { z } from 'zod'
import type { DatePrecision } from './log'

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

export const publicationYearSchema = z
  .number()
  .int()
  .min(-3000, { message: 'Ano anterior a -3000.' })
  .max(2100, { message: 'Ano posterior a 2100.' })

export const editionInputSchema = z.object({
  isbn: z.string().max(40).nullish(),
  publisher: z.string().max(200).nullish(),
  page_count: z.number().int().positive().max(50000).nullish(),
  published_year: publicationYearSchema.nullish(),
  language: z.string().length(2).nullish(),
  cover_url: coverUrlSchema.nullish(),
  ol_cover_id: z.number().int().positive().nullish(),
})

export const genreIdSchema = z
  .number()
  .int()
  .min(1, { message: 'Gênero inválido.' })
  .max(32767, { message: 'Gênero inválido.' })

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
  series_number: z.string().max(20).nullish(),
  ol_work_key: z.string().max(100).nullish(),
  genre_ids: z.array(genreIdSchema).max(10).default([]),
  edition: editionInputSchema.nullish(),
})

export type WorkInput = z.infer<typeof workInputSchema>
export type EditionInput = z.infer<typeof editionInputSchema>
export type AuthorInput = z.infer<typeof authorInputSchema>

export const workUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    authors: z.array(authorInputSchema).min(1).max(5).optional(),
    original_language: z.string().length(2).nullable().optional(),
    first_published_year: publicationYearSchema.nullable().optional(),
    series_name: z.string().max(200).nullable().optional(),
    series_number: z.string().max(20).nullable().optional(),
    genre_ids: z.array(genreIdSchema).max(10).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Envie ao menos um campo para atualizar.',
  })

export const editionUpdateSchema = z
  .object({
    isbn: z.string().max(40).nullable().optional(),
    publisher: z.string().max(200).nullable().optional(),
    page_count: z.number().int().positive().max(50000).nullable().optional(),
    published_year: publicationYearSchema.nullable().optional(),
    language: z.string().length(2).nullable().optional(),
    cover_url: coverUrlSchema.nullable().optional(),
    ol_cover_id: z.number().int().positive().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Envie ao menos um campo para atualizar.',
  })

export type WorkUpdateInput = z.infer<typeof workUpdateSchema>
export type EditionUpdateInput = z.infer<typeof editionUpdateSchema>

export function hasField<T extends object>(obj: T, key: PropertyKey): boolean {
  return key in obj && (obj as Record<PropertyKey, unknown>)[key] !== undefined
}

export function formatPublicationYear(year: number | null | undefined): string | null {
  if (year === null || year === undefined) return null
  if (year < 0) return `${Math.abs(year)} a.C.`
  return String(year)
}

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
  finished_precision: DatePrecision
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
  created_by?: string | null
}
