import { desc, eq, inArray, sql } from 'drizzle-orm'
import {
  buildReviewExcerpt,
  type FeedAuthorView,
  type FeedEntry,
  type FeedResponse,
} from '../../shared/schemas/feed'
import { db } from '../db'
import { authors, editions, reading_logs, users, work_authors, works } from '../db/schema'
import { visibleLogs, type Viewer } from './visibility'

/**
 * Service to fetch the recent reading logs feed.
 *
 * Rules (TASK-018):
 * - Authenticated: up to 10 most recent visible entries.
 * - ORDER BY created_at DESC LIMIT 10.
 * - No pagination, no cursor, no tab, no infinite scroll.
 * - Filter through visibleLogs(viewer).
 * - limit capped at 10 server-side regardless of caller input.
 */
export async function getRecentFeed(
  viewer: Viewer,
  limit: number = 10,
): Promise<FeedResponse> {
  const effectiveLimit = Math.min(Math.max(1, limit), 10)

  const rows = await db
    .select({
      id: reading_logs.id,
      rating: reading_logs.rating,
      review: reading_logs.review,
      created_at: reading_logs.created_at,
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
    .where(visibleLogs(viewer))
    .orderBy(desc(reading_logs.created_at))
    .limit(effectiveLimit)

  if (rows.length === 0) {
    return { entries: [] }
  }

  // Batch query authors for all returned works
  const workIds = [...new Set(rows.map((r) => r.work.id))]
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

  const entries: FeedEntry[] = rows.map((row) => ({
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

  return { entries }
}
