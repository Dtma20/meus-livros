import { z } from 'zod'
import { coverUrlSchema } from './work'
import { datePrecisionSchema, ratingSchema, reviewSchema } from './log'

export const livroJsonSchema = z.object({
  title: z.string().min(1, 'O título é obrigatório.').max(300),
  author: z.string().min(1, 'O autor é obrigatório.').max(500),
  country: z.string().max(100).optional().nullable(),
  country_code: z.string().max(10).optional().nullable(),
  original_language: z.string().max(50).optional().nullable(),
  year: z.number().int().optional().nullable(),
  publisher: z.string().max(255).optional().nullable(),
  pages: z.number().int().positive().optional().nullable(),
  // Format is checked per item by parseReadIn in library-transfer.ts, so one bad date skips only that book.
  read_in: z.union([z.number().int(), z.string()]).optional().nullable(),
  // Optional, so exports from before these fields existed still import. Checked per item in library-transfer.ts.
  started_on: z.string().max(10).optional().nullable(),
  finished_precision: datePrecisionSchema.optional().nullable(),
  rate: ratingSchema.optional().nullable(),
  review: reviewSchema.optional().nullable(),
  source: z.string().max(50).optional().nullable(),
  series_name: z.string().max(255).optional().nullable(),
  series_number: z.string().max(50).optional().nullable(),
  genre: z.array(z.string().max(50)).optional().default([]),
  isbn: z.string().max(50).optional().nullable(),
  cover_url: coverUrlSchema.optional().nullable(),
  visibility: z.string().max(50).optional().nullable(),
})

export type LivroJson = z.infer<typeof livroJsonSchema>

export const importLibraryPayloadSchema = z.object({
  books: z.array(livroJsonSchema).min(1, 'Ao menos um livro deve ser enviado.').max(1000, 'Limite de 1000 livros por importação.'),
})

export type ImportLibraryPayload = z.infer<typeof importLibraryPayloadSchema>

export interface ImportResult {
  importedCount: number
  skippedCount: number
  errors: string[]
}
