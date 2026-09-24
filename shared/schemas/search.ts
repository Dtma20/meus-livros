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
  id: z.string().optional(),
  slug: z.string().optional(),
  title: z.string(),
  authors: z.array(z.object({ name: z.string(), slug: z.string().optional() })),
  first_published_year: z.number().int().nullable().optional(),
  cover_url: z.string().nullable().optional(),
  log_count: z.number().int().optional().default(0),
})

export const searchResponseSchema = z.object({
  works: z.array(searchResultSchema),
})

export type SearchResult = z.infer<typeof searchResultSchema>
export type SearchResponse = z.infer<typeof searchResponseSchema>

