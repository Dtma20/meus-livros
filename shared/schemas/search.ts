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

/** One result item as returned by the API. */
export const searchResultSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  authors: z.array(z.object({ name: z.string(), slug: z.string() })),
  first_published_year: z.number().int().nullable(),
  cover_url: z.string().nullable(),
  log_count: z.number().int(),
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
})

export const externalSearchResponseSchema = z.object({
  results: z.array(externalBookResultSchema),
  indisponivel: z.boolean().optional(),
})

export type ExternalBookResult = z.infer<typeof externalBookResultSchema>
export type ExternalSearchResponse = z.infer<typeof externalSearchResponseSchema>
