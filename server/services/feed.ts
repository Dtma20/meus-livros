import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { createError, isError } from 'h3'
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface CursorPayload {
  t: string
  id: string
}

export interface FeedPageOptions {
  cursor?: string | null
  limit?: number
}

export function decodeCursor(cursor: string): CursorPayload {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid')
    }
    const { t, id } = parsed as Record<string, unknown>
    if (typeof t !== 'string' || typeof id !== 'string') {
      throw new Error('invalid')
    }
    const time = new Date(t).getTime()
    if (Number.isNaN(time)) {
      throw new Error('invalid')
    }
    if (!UUID_REGEX.test(id)) {
      throw new Error('invalid')
    }
    return { t, id }
  } catch (err) {
    if (isError(err) && (err as { statusCode?: number }).statusCode === 400) {
      throw err
    }
    throw createError({
      statusCode: 400,
      data: {
        error: 'cursor_invalido',
        message: 'Cursor de paginação inválido.',
      },
    })
  }
}

export function encodeCursor(entry: { cursor_created_at?: string; created_at: Date | string; id: string }): string {
  const t =
    entry.cursor_created_at ??
    (entry.created_at instanceof Date ? entry.created_at.toISOString() : new Date(entry.created_at).toISOString())
  return Buffer.from(JSON.stringify({ t, id: entry.id }), 'utf8').toString('base64url')
}

export async function getFeedPage(
  viewer: Viewer,
  options?: FeedPageOptions,
): Promise<FeedPageResponse> {
  const limit = options?.limit ?? 20
  const effectiveLimit = Math.min(Math.max(1, limit), 30)

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
    return { entries: [], nextCursor: null }
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

  return { entries, nextCursor }
}

export async function getRecentFeed(
  viewer: Viewer,
  limit: number = 10,
): Promise<FeedResponse> {
  const effectiveLimit = Math.min(Math.max(1, limit), 10)
  const page = await getFeedPage(viewer, { limit: effectiveLimit })
  return { entries: page.entries }
}
