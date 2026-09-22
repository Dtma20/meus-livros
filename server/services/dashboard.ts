import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { buildReviewExcerpt } from '../../shared/schemas/feed'
import type {
  DashboardAuthorView,
  DashboardCompletedBook,
  DashboardInProgressBook,
  DashboardResponse,
} from '../../shared/schemas/dashboard'
import { calculateReadingProgress } from '../../shared/utils/reading-progress'
import { db } from '../db'
import { authors, editions, reading_blocks, reading_logs, work_authors, works } from '../db/schema'

export async function getDashboardData(userId: string): Promise<DashboardResponse> {
  // 1. In-progress books (finished_on IS NULL)
  const inProgressRows = await db
    .select({
      id: reading_logs.id,
      started_on: reading_logs.started_on,
      updated_at: reading_logs.updated_at,
      edition_page_count: editions.page_count,
      work: {
        id: works.id,
        title: works.title,
        slug: works.slug,
        first_published_year: works.first_published_year,
        cover_url: sql<string | null>`(
          SELECT e.cover_url FROM editions e WHERE e.work_id = works.id AND e.cover_url IS NOT NULL ORDER BY e.created_at, e.id LIMIT 1
        )`,
        isbn13: editions.isbn13,
        ol_cover_id: editions.ol_cover_id,
      },
    })
    .from(reading_logs)
    .innerJoin(works, eq(works.id, reading_logs.work_id))
    .leftJoin(editions, eq(editions.id, reading_logs.edition_id))
    .where(and(eq(reading_logs.user_id, userId), isNull(reading_logs.finished_on)))
    .orderBy(desc(reading_logs.updated_at))

  // 2. Completed books (finished_on IS NOT NULL) ordered by finished_on DESC
  const completedRows = await db
    .select({
      id: reading_logs.id,
      rating: reading_logs.rating,
      review: reading_logs.review,
      finished_on: reading_logs.finished_on,
      finished_precision: reading_logs.finished_precision,
      created_at: reading_logs.created_at,
      work: {
        id: works.id,
        title: works.title,
        slug: works.slug,
        first_published_year: works.first_published_year,
        cover_url: sql<string | null>`(
          SELECT e.cover_url FROM editions e WHERE e.work_id = works.id AND e.cover_url IS NOT NULL ORDER BY e.created_at, e.id LIMIT 1
        )`,
        isbn13: editions.isbn13,
        ol_cover_id: editions.ol_cover_id,
      },
    })
    .from(reading_logs)
    .innerJoin(works, eq(works.id, reading_logs.work_id))
    .leftJoin(editions, eq(editions.id, reading_logs.edition_id))
    .where(and(eq(reading_logs.user_id, userId), isNotNull(reading_logs.finished_on)))
    .orderBy(desc(reading_logs.finished_on), desc(reading_logs.created_at))

  // Collect all work IDs to batch fetch authors
  const allWorkIds = [
    ...new Set([...inProgressRows.map((r) => r.work.id), ...completedRows.map((r) => r.work.id)]),
  ]

  const authorsByWorkId = new Map<string, DashboardAuthorView[]>()
  if (allWorkIds.length > 0) {
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
      .where(inArray(work_authors.work_id, allWorkIds))
      .orderBy(work_authors.position)

    for (const a of authorsRows) {
      let list = authorsByWorkId.get(a.work_id)
      if (!list) {
        list = []
        authorsByWorkId.set(a.work_id, list)
      }
      list.push({ id: a.id, name: a.name, slug: a.slug })
    }
  }

  // Fetch blocks for all in-progress books to calculate progress
  const inProgressLogIds = inProgressRows.map((r) => r.id)
  const blocksByLogId = new Map<string, Array<{ start_page: number; end_page: number }>>()
  if (inProgressLogIds.length > 0) {
    const blocksRows = await db
      .select({
        log_id: reading_blocks.log_id,
        start_page: reading_blocks.start_page,
        end_page: reading_blocks.end_page,
      })
      .from(reading_blocks)
      .where(inArray(reading_blocks.log_id, inProgressLogIds))

    for (const b of blocksRows) {
      let list = blocksByLogId.get(b.log_id)
      if (!list) {
        list = []
        blocksByLogId.set(b.log_id, list)
      }
      list.push({ start_page: b.start_page, end_page: b.end_page })
    }
  }

  const inProgress: DashboardInProgressBook[] = inProgressRows.map((row) => {
    const intervals = blocksByLogId.get(row.id) ?? []
    const calc = calculateReadingProgress(intervals, row.edition_page_count, false)

    return {
      id: row.id,
      work: {
        ...row.work,
        authors: authorsByWorkId.get(row.work.id) ?? [],
      },
      started_on: row.started_on,
      updated_at: row.updated_at,
      pages_read: calc.pagesRead,
      total_pages: calc.totalPages,
      current_page: calc.currentPage,
      percentage: calc.percentage,
    }
  })

  const completed: DashboardCompletedBook[] = completedRows.map((row) => ({
    id: row.id,
    work: {
      ...row.work,
      authors: authorsByWorkId.get(row.work.id) ?? [],
    },
    rating: row.rating !== null ? Number(row.rating) : null,
    review_excerpt: buildReviewExcerpt(row.review),
    finished_on: row.finished_on as string,
    finished_precision: row.finished_precision,
    created_at: row.created_at,
  }))

  return { inProgress, completed }
}
