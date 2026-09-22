import { z } from 'zod'

/**
 * Query string schema for GET /api/search.
 *
 * - Shorter than 2 chars is not an error: the route returns 200 { works: [] }.
 * - Capped at 100 chars per the security requirements.
 */
export const searchQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
})

export type SearchQuery = z.infer<typeof searchQuerySchema>

/** One result item as returned by the API (local or external). */
export const searchResultSchema = z.object({
  id: z.string().optional(),
  slug: z.string().optional(),
  title: z.string(),
  authors: z.array(z.object({ name: z.string(), slug: z.string().optional() })),
  first_published_year: z.number().int().nullable().optional(),
  cover_url: z.string().nullable().optional(),
  log_count: z.number().int().optional().default(0),
  source: z.enum(['local', 'externo']).optional().default('local'),
  ol_work_key: z.string().optional(),
  ol_cover_id: z.number().int().nullable().optional(),
  language: z.string().nullable().optional(),
  // Only ever set on external results — a local work's pages live on its
  // editions, not on the search row.
  page_count: z.number().int().nullable().optional(),
})

export const searchResponseSchema = z.object({
  works: z.array(searchResultSchema),
})

export type SearchResult = z.infer<typeof searchResultSchema>
export type SearchResponse = z.infer<typeof searchResponseSchema>

/** One result item from external lookup (Open Library) */
export const externalBookResultSchema = z.object({
  ol_work_key: z.string(),
  title: z.string(),
  authors: z.array(z.string()),
  first_publish_year: z.number().int().nullable(),
  cover_url: z.string().nullable(),
  ol_cover_id: z.number().int().nullable(),
  language: z.string().nullable(),
  page_count: z.number().int().nullable(),
})

export const externalSearchResponseSchema = z.object({
  results: z.array(externalBookResultSchema),
  indisponivel: z.boolean().optional(),
})

export type ExternalBookResult = z.infer<typeof externalBookResultSchema>
export type ExternalSearchResponse = z.infer<typeof externalSearchResponseSchema>
