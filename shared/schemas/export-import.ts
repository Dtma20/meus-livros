import { z } from 'zod'
import {
  datePrecisionSchema,
  ratingSchema,
  reviewSchema,
} from './log'
import { coverUrlSchema, publicationYearSchema } from './work'

export const importPagesSchema = z
  .number()
  .int()
  .positive({ message: 'O número de páginas deve ser positivo.' })
  .max(50000, { message: 'Número de páginas superior a 50.000.' })

export const importVisibilitySchema = z.enum(['publico', 'privado'], {
  message: 'Visibilidade inválida.',
})

export const livroItemSchema = z.object({
  title: z.string().min(1, 'O título é obrigatório.').max(300),
  author: z.string().min(1, 'O autor é obrigatório.').max(1008),
  country: z.string().max(100).optional().nullable(),
  country_code: z.string().max(10).optional().nullable(),
  original_language: z.string().max(50).optional().nullable(),
  year: publicationYearSchema.optional().nullable(),
  publisher: z.string().max(255).optional().nullable(),
  pages: importPagesSchema.optional().nullable(),
  read_in: z.union([z.number().int(), z.string()]).optional().nullable(),
  started_on: z.string().max(10).optional().nullable(),
  finished_precision: datePrecisionSchema.optional().nullable(),
  rate: ratingSchema.optional().nullable(),
  review: reviewSchema.optional().nullable(),
  source: z.string().max(50).optional().nullable(),
  format: z.string().max(50).optional().nullable(),
  series_name: z.string().max(255).optional().nullable(),
  series_number: z.string().max(50).optional().nullable(),
  genre: z.array(z.string().max(50)).optional().default([]),
  isbn: z.string().max(50).optional().nullable(),
  cover_url: coverUrlSchema.optional().nullable(),
  visibility: importVisibilitySchema.optional().nullable(),
})

export type LivroItem = z.infer<typeof livroItemSchema>
export const livroJsonSchema = livroItemSchema
export type LivroJson = LivroItem

export const importBatchItemSchema = z
  .object({
    title: z.string().min(1, 'O título é obrigatório.').max(300),
    author: z.string().min(1, 'O autor é obrigatório.').max(1008),
  })
  .passthrough()

export type ImportBatchItem = z.infer<typeof importBatchItemSchema>

export const booksArraySchema = z
  .array(importBatchItemSchema)
  .min(1, 'Envie ao menos um livro para importação.')
  .max(1000, 'Limite de 1000 livros por importação.')

export const booksObjectSchema = z.object({
  books: booksArraySchema,
})

export const importLibraryPayloadSchema = z.object({
  books: z.array(importBatchItemSchema).min(1, 'Ao menos um livro deve ser enviado.').max(1000, 'Limite de 1000 livros por importação.'),
})

export type ImportLibraryPayload = z.infer<typeof importLibraryPayloadSchema>

export interface ImportResult {
  importedCount: number
  skippedCount: number
  errors: string[]
}
