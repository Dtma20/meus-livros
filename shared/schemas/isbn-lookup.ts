import { z } from 'zod'
import { normalizeIsbn } from '../lib/isbn'
import { coverUrlSchema, publicationYearSchema } from './work'

export function normalizeLookupIsbn(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw.replace(/[-\s]/g, '').toUpperCase()
  if (!/^(?:\d{9}[\dX]|97[89]\d{10})$/.test(cleaned)) return null
  return normalizeIsbn(cleaned)
}

const fields = {
  title: z.string().trim().min(1).max(300),
  authors: z.array(z.string().trim().min(1).max(200)).max(5),
  publisher: z.string().trim().min(1).max(200),
  page_count: z.number().int().positive().max(50000),
  year: publicationYearSchema,
  cover_url: coverUrlSchema,
}
export const isbnLookupDataSchema = z.object(fields).partial()
export type IsbnLookupData = z.infer<typeof isbnLookupDataSchema>
export type IsbnLookupResult = { status: 'found'; data: IsbnLookupData } | { status: 'not_found' }

export function sanitizeIsbnData(raw: Record<string, unknown>): IsbnLookupData {
  const data: Record<string, unknown> = {}
  for (const key of ['title', 'publisher', 'page_count', 'year', 'cover_url'] as const) {
    const value = typeof raw[key] === 'string' ? raw[key].trim() : raw[key]
    const parsed = fields[key].safeParse(value)
    if (parsed.success) data[key] = parsed.data
  }
  if (Array.isArray(raw.authors)) {
    const names: string[] = []
    for (const value of raw.authors) {
      const parsed = fields.authors.element.safeParse(value)
      if (parsed.success && !names.some(name => name.toLocaleLowerCase() === parsed.data.toLocaleLowerCase())) names.push(parsed.data)
    }
    if (names.length) data.authors = names.slice(0, 5)
  }
  return isbnLookupDataSchema.parse(data)
}
