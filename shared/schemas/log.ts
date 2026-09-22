import { z } from 'zod'
import type { ReadingBlockView, ReadingProgressView } from './reading-block'

/**
 * Returns today's date in YYYY-MM-DD format according to America/Sao_Paulo timezone.
 * Default finished_on comes from the browser's local date, but the server validates
 * against America/Sao_Paulo to reject future dates (cohort is UTC-3, server is UTC).
 */
export function getTodaySaoPaulo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * Checks if a YYYY-MM-DD string is in the future in America/Sao_Paulo.
 */
export function isFutureDateSaoPaulo(dateStr: string, now: Date = new Date()): boolean {
  const today = getTodaySaoPaulo(now)
  return dateStr > today
}

/**
 * Half-star rating: 0.5 to 5.0 in steps of 0.5.
 * A client posting 3.7 or 6.0 is rejected with 400.
 */
export const ratingSchema = z
  .number()
  .min(0.5, { message: 'A nota mínima é 0,5 estrela.' })
  .max(5, { message: 'A nota máxima é 5 estrelas.' })
  .refine((r) => r * 2 === Math.trunc(r * 2), {
    message: 'A nota deve ser em intervalos de 0,5 estrela.',
  })

/**
 * Review text: plain text, max 10,000 characters.
 * Stored verbatim and rendered escaped.
 */
export const reviewSchema = z
  .string()
  .max(10000, { message: 'A resenha pode ter no máximo 10.000 caracteres.' })

/**
 * YYYY-MM-DD date string that cannot be in the future in America/Sao_Paulo.
 */
export const logDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data deve estar no formato AAAA-MM-DD.' })
  .refine((d) => !isFutureDateSaoPaulo(d), {
    message: 'A data não pode ser no futuro.',
  })

export const datePrecisionSchema = z.enum(['dia', 'mes', 'ano'])
export const bookFormatSchema = z.enum(['fisico', 'ebook', 'audio'])
export const logVisibilitySchema = z.enum(['publico', 'privado'])

/**
 * Schema for POST /api/logs
 */
export const logInputSchema = z
  .object({
    work_id: z.string().uuid({ message: 'ID da obra inválido.' }),
    edition_id: z.string().uuid({ message: 'ID da edição inválido.' }).nullish(),
    rating: ratingSchema.nullish(),
    review: reviewSchema.nullish(),
    started_on: logDateSchema.nullish(),
    finished_on: logDateSchema.nullish(),
    finished_precision: datePrecisionSchema.default('dia'),
    format: bookFormatSchema.nullish(),
    visibility: logVisibilitySchema.default('publico'),
  })
  .refine(
    (data) => {
      if (data.started_on && data.finished_on) {
        return data.started_on <= data.finished_on
      }
      return true
    },
    {
      message: 'A data de início deve ser anterior ou igual à data de término.',
      path: ['started_on'],
    },
  )

/**
 * Schema for PATCH /api/logs/:id
 */
export const updateLogInputSchema = z
  .object({
    edition_id: z.string().uuid({ message: 'ID da edição inválido.' }).nullish(),
    rating: ratingSchema.nullish(),
    review: reviewSchema.nullish(),
    started_on: logDateSchema.nullish(),
    finished_on: logDateSchema.nullish(),
    finished_precision: datePrecisionSchema.optional(),
    format: bookFormatSchema.nullish(),
    visibility: logVisibilitySchema.optional(),
  })
  .refine(
    (data) => {
      if (data.started_on && data.finished_on) {
        return data.started_on <= data.finished_on
      }
      return true
    },
    {
      message: 'A data de início deve ser anterior ou igual à data de término.',
      path: ['started_on'],
    },
  )

export type DatePrecision = z.infer<typeof datePrecisionSchema>
export type BookFormat = z.infer<typeof bookFormatSchema>
export type LogVisibility = z.infer<typeof logVisibilitySchema>

/**
 * The shape `GET /api/logs/:id` returns.
 *
 * It lives here because it is a contract between the route and the page, and a
 * page must never reach into `server/`. The enums come from the Zod schemas
 * above rather than from the Drizzle types, so there is still one definition:
 * `shared/` cannot import `server/`, and duplicating the unions by hand is how
 * they drift.
 */
export interface LogAuthorView {
  id: string
  name: string
  slug: string
}

export interface LogWorkView {
  id: string
  title: string
  slug: string
  first_published_year: number | null
  cover_url: string | null
  authors: LogAuthorView[]
}

export interface LogEditionView {
  id: string
  isbn13: string | null
  publisher: string | null
  cover_url: string | null
  ol_cover_id: number | null
  page_count: number | null
  published_year: number | null
}

export interface LogUserView {
  id: string
  handle: string
  display_name: string
  profile_visibility: LogVisibility
}

export interface LogWithDetails {
  id: string
  user_id: string
  work_id: string
  edition_id: string | null
  rating: number | null
  review: string | null
  started_on: string | null
  finished_on: string | null
  finished_precision: DatePrecision
  format: BookFormat | null
  visibility: LogVisibility
  created_at: Date
  updated_at: Date
  user: LogUserView
  work: LogWorkView
  edition: LogEditionView | null
  blocks?: ReadingBlockView[]
  progress?: ReadingProgressView
}

export type LogInput = z.infer<typeof logInputSchema>
export type UpdateLogInput = z.infer<typeof updateLogInputSchema>
