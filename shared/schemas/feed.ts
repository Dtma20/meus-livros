import { z } from 'zod'

export const feedQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional().default(10),
})

export type FeedQuery = z.infer<typeof feedQuerySchema>

export const feedAuthorSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
})

export const feedWorkSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  slug: z.string(),
  first_published_year: z.number().int().nullable(),
  cover_url: z.string().nullable(),
  authors: z.array(feedAuthorSchema),
})

export const feedEditionSchema = z.object({
  id: z.string().uuid(),
  isbn13: z.string().nullable(),
  publisher: z.string().nullable(),
  cover_url: z.string().nullable(),
  ol_cover_id: z.number().int().nullable(),
})

export const feedUserSchema = z.object({
  handle: z.string(),
  display_name: z.string(),
})

export const feedEntrySchema = z.object({
  id: z.string().uuid(),
  rating: z.number().nullable(),
  review_excerpt: z.string().nullable(),
  created_at: z.union([z.date(), z.string()]),
  user: feedUserSchema,
  work: feedWorkSchema,
  edition: feedEditionSchema.nullable(),
})

export const feedResponseSchema = z.object({
  entries: z.array(feedEntrySchema),
})

export type FeedAuthorView = z.infer<typeof feedAuthorSchema>
export type FeedWorkView = z.infer<typeof feedWorkSchema>
export type FeedEditionView = z.infer<typeof feedEditionSchema>
export type FeedUserView = z.infer<typeof feedUserSchema>
export type FeedEntry = z.infer<typeof feedEntrySchema>
export type FeedResponse = z.infer<typeof feedResponseSchema>

/**
 * Builds a clean plain-text review excerpt (up to maxLength characters).
 */
export function buildReviewExcerpt(review: string | null | undefined, maxLength = 200): string | null {
  if (!review) return null
  const clean = review.trim()
  if (!clean) return null
  if (clean.length <= maxLength) return clean
  return clean.slice(0, maxLength).trimEnd() + '…'
}
