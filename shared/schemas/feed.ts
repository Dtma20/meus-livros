import { z } from 'zod'

export const feedQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional().default(10),
})

export type FeedQuery = z.infer<typeof feedQuerySchema>

export const feedCursorQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(30).optional().default(20),
})

export type FeedCursorQuery = z.infer<typeof feedCursorQuerySchema>

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
  isbn13: z.string().nullable().optional(),
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
  started_on: z.string().nullable().optional(),
  finished_on: z.string().nullable().optional(),
  created_at: z.union([z.date(), z.string()]),
  user: feedUserSchema,
  work: feedWorkSchema,
  edition: feedEditionSchema.nullable(),
})

export const feedResponseSchema = z.object({
  entries: z.array(feedEntrySchema),
  nextCursor: z.string().nullable().optional(),
})

export type FeedAuthorView = z.infer<typeof feedAuthorSchema>
export type FeedWorkView = z.infer<typeof feedWorkSchema>
export type FeedEditionView = z.infer<typeof feedEditionSchema>
export type FeedUserView = z.infer<typeof feedUserSchema>
export type FeedEntry = z.infer<typeof feedEntrySchema>
export type FeedResponse = z.infer<typeof feedResponseSchema>
export type FeedPageResponse = {
  entries: FeedEntry[]
  nextCursor: string | null
}

export function buildReviewExcerpt(review: string | null | undefined, maxLength = 200): string | null {
  if (!review) return null
  const clean = review.trim()
  if (!clean) return null
  if (clean.length <= maxLength) return clean
  return clean.slice(0, maxLength).trimEnd() + '…'
}
