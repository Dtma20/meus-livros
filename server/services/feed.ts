import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { createError } from 'h3'
import { z } from 'zod'
import {
  buildReviewExcerpt,
  type FeedAuthorView,
  type FeedEntry,
  type FeedPageResponse,
  type FeedResponse,
} from '../../shared/schemas/feed'
import { db } from '../db'
import { authors, editions, reading_logs, users, work_authors, works } from '../db/schema'
import { visibleLogs, type Viewer } from './visibility'

const cursorPayloadSchema = z.object({
  t: z.iso.datetime().refine((t) => !t.startsWith('0000-')),
  id: z.uuid(),
})

export type CursorPayload = z.infer<typeof cursorPayloadSchema>

export interface FeedPageOptions {
  cursor?: string | null
  limit?: number
}

function invalidCursor(): Error {
  return createError({
    statusCode: 400,
    data: {
      error: 'cursor_invalido',
      message: 'Cursor de paginação inválido.',
    },
  })
}

export function decodeCursor(cursor: string): CursorPayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    throw invalidCursor()
  }
  const result = cursorPayloadSchema.safeParse(parsed)
  if (!result.success) {
    throw invalidCursor()
  }
  return result.data
}

export function encodeCursor(entry: { cursor_created_at?: string; created_at: Date | string; id: string }): string {
  const t =
    entry.cursor_created_at ??
    (entry.created_at instanceof Date ? entry.created_at.toISOString() : new Date(entry.created_at).toISOString())
  return Buffer.from(JSON.stringify({ t, id: entry.id }), 'utf8').toString('base64url')
}

interface FeedCacheEntry {
  data: FeedPageResponse
  expiresAt: number
}

const feedCache = new Map<string, FeedCacheEntry>()
export const FEED_CACHE_TTL_MS = 30_000 // 30 seconds

export function invalidateFeedCache(): void {
  feedCache.clear()
}

export async function getFeedPage(
  viewer: Viewer,
  options?: FeedPageOptions,
): Promise<FeedPageResponse> {
  const limit = options?.limit ?? 20
  const effectiveLimit = Math.min(Math.max(1, limit), 30)

  const isFirstPage = !options?.cursor
  const cacheKey = isFirstPage ? `${viewer?.id ?? 'public'}:${effectiveLimit}` : null

  if (cacheKey) {
    const cached = feedCache.get(cacheKey)
    if (cached) {
      if (cached.expiresAt > Date.now()) {
        return {
          entries: [...cached.data.entries],
          nextCursor: cached.data.nextCursor,
        }
      }
      feedCache.delete(cacheKey)
    }
  }

  let cursorCond: SQL | undefined
  if (options?.cursor) {
    const cursor = decodeCursor(options.cursor)
    cursorCond = sql`(${reading_logs.created_at}, ${reading_logs.id}) < (${cursor.t}::timestamptz, ${cursor.id}::uuid)`
  }

  const whereClause = cursorCond
    ? and(visibleLogs(viewer), cursorCond)
    : visibleLogs(viewer)

  const rows = await db
    .select({
      id: reading_logs.id,
      rating: reading_logs.rating,
      review: reading_logs.review,
      started_on: reading_logs.started_on,
      finished_on: reading_logs.finished_on,
      created_at: reading_logs.created_at,
      cursor_created_at: sql<string>`to_char(reading_logs.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      user: {
        handle: users.handle,
        display_name: users.display_name,
      },
      work: {
        id: works.id,
        title: works.title,
        slug: works.slug,
        first_published_year: works.first_published_year,
        cover_url: sql<string | null>`(
          SELECT e.cover_url FROM editions e WHERE e.work_id = works.id AND e.cover_url IS NOT NULL ORDER BY e.created_at, e.id LIMIT 1
        )`,
        isbn13: sql<string | null>`(
          SELECT e.isbn13 FROM editions e WHERE e.work_id = works.id AND e.isbn13 IS NOT NULL ORDER BY e.created_at, e.id LIMIT 1
        )`,
      },
      edition: {
        id: editions.id,
        isbn13: editions.isbn13,
        publisher: editions.publisher,
        cover_url: editions.cover_url,
        ol_cover_id: editions.ol_cover_id,
      },
    })
    .from(reading_logs)
    .innerJoin(users, eq(users.id, reading_logs.user_id))
    .innerJoin(works, eq(works.id, reading_logs.work_id))
    .leftJoin(editions, eq(editions.id, reading_logs.edition_id))
    .where(whereClause)
    .orderBy(desc(reading_logs.created_at), desc(reading_logs.id))
    .limit(effectiveLimit + 1)

  if (rows.length === 0) {
    const emptyResult: FeedPageResponse = { entries: [], nextCursor: null }
    if (cacheKey) {
      feedCache.set(cacheKey, {
        data: emptyResult,
        expiresAt: Date.now() + FEED_CACHE_TTL_MS,
      })
    }
    return emptyResult
  }

  const hasMore = rows.length > effectiveLimit
  const pageRows = hasMore ? rows.slice(0, effectiveLimit) : rows

  const workIds = [...new Set(pageRows.map((r) => r.work.id))]
  const authorsRows = await db
    .select({
      work_id: work_authors.work_id,
      id: authors.id,
      name: authors.name,
      slug: authors.slug,
      position: work_authors.position,
    })
    .from(work_authors)
    .innerJoin(authors, eq(authors.id, work_authors.author_id))
    .where(inArray(work_authors.work_id, workIds))
    .orderBy(work_authors.position)

  const authorsByWorkId = new Map<string, FeedAuthorView[]>()
  for (const a of authorsRows) {
    let list = authorsByWorkId.get(a.work_id)
    if (!list) {
      list = []
      authorsByWorkId.set(a.work_id, list)
    }
    list.push({ id: a.id, name: a.name, slug: a.slug })
  }

  const entries: FeedEntry[] = pageRows.map((row) => ({
    id: row.id,
    rating: row.rating !== null ? Number(row.rating) : null,
    review_excerpt: buildReviewExcerpt(row.review),
    started_on: row.started_on,
    finished_on: row.finished_on,
    created_at: row.created_at,
    user: row.user,
    work: {
      ...row.work,
      authors: authorsByWorkId.get(row.work.id) ?? [],
    },
    edition: row.edition?.id
      ? {
          id: row.edition.id,
          isbn13: row.edition.isbn13,
          publisher: row.edition.publisher,
          cover_url: row.edition.cover_url,
          ol_cover_id: row.edition.ol_cover_id,
        }
      : null,
  }))

  let nextCursor: string | null = null
  if (hasMore && pageRows.length > 0) {
    const lastRow = pageRows[pageRows.length - 1]!
    nextCursor = encodeCursor(lastRow)
  }

  const result: FeedPageResponse = { entries, nextCursor }

  if (cacheKey) {
    if (feedCache.size > 100) {
      const now = Date.now()
      for (const [key, item] of feedCache) {
        if (item.expiresAt <= now) {
          feedCache.delete(key)
        }
      }
    }
    feedCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + FEED_CACHE_TTL_MS,
    })
  }

  return result
}

export async function getRecentFeed(
  viewer: Viewer,
  limit: number = 10,
): Promise<FeedResponse> {
  const effectiveLimit = Math.min(Math.max(1, limit), 10)
  const page = await getFeedPage(viewer, { limit: effectiveLimit })
  return { entries: page.entries }
}
