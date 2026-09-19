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
export const coverUrlSchema = z
  .string()
  .max(2000)
  .refine((value) => {
    try {
      return new URL(value).protocol === 'https:'
    } catch {
      return false
    }
  }, { message: 'A URL da capa precisa começar com https://' })

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
