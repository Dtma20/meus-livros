import { z } from 'zod'
import type { ReadingBlockView, ReadingProgressView } from './reading-block'

export function getTodaySaoPaulo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function isFutureDateSaoPaulo(dateStr: string, now: Date = new Date()): boolean {
  const today = getTodaySaoPaulo(now)
  return dateStr > today
}

export const ratingSchema = z
  .number()
  .min(0.5, { message: 'A nota mínima é 0,5 estrela.' })
  .max(5, { message: 'A nota máxima é 5 estrelas.' })
  .refine((r) => r * 2 === Math.trunc(r * 2), {
    message: 'A nota deve ser em intervalos de 0,5 estrela.',
  })

export const reviewSchema = z
  .string()
  .max(10000, { message: 'A resenha pode ter no máximo 10.000 caracteres.' })

export const logDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data deve estar no formato AAAA-MM-DD.' })
  .refine((d) => !isFutureDateSaoPaulo(d), {
    message: 'A data não pode ser no futuro.',
  })

export const datePrecisionSchema = z.enum(['dia', 'mes', 'ano'])
export const bookFormatSchema = z.enum(['fisico', 'ebook', 'audio'])
export const logVisibilitySchema = z.enum(['publico', 'privado'])

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
