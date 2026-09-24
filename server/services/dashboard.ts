import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
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
  //
  // Built, not awaited: a Drizzle query builder only issues SQL when it is
  // awaited, so this and the completed-books query below go out together as
  // one pipelined wave instead of two back-to-back round trips.
  const inProgressQuery = db
    .select({
      id: reading_logs.id,
      started_on: reading_logs.started_on,
      updated_at: reading_logs.updated_at,
      edition_page_count: editions.page_count,
      edition_id: reading_logs.edition_id,
      work: {
        id: works.id,
        title: works.title,
        slug: works.slug,
        first_published_year: works.first_published_year,
      },
    })
    .from(reading_logs)
    .innerJoin(works, eq(works.id, reading_logs.work_id))
    .leftJoin(editions, eq(editions.id, reading_logs.edition_id))
    .where(and(eq(reading_logs.user_id, userId), isNull(reading_logs.finished_on)))
    .orderBy(desc(reading_logs.updated_at), desc(reading_logs.id))
    .limit(50)

  // 2. Completed books (finished_on IS NOT NULL) ordered by finished_on DESC
  const completedQuery = db
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
      },
    })
    .from(reading_logs)
    .innerJoin(works, eq(works.id, reading_logs.work_id))
    .leftJoin(editions, eq(editions.id, reading_logs.edition_id))
    .where(and(eq(reading_logs.user_id, userId), isNotNull(reading_logs.finished_on)))
    .orderBy(desc(reading_logs.finished_on), desc(reading_logs.created_at), desc(reading_logs.id))
    .limit(50)

  // As in getProfileData, with postgres(url, { max: 1 }) Promise.all pipelines
  // queries over the single connection rather than running them in parallel
  // server side. The gain is one fewer round trip — which is the whole cost
  // here: from Brazil a warm round trip to Neon sa-east-1 is ~45 ms and these
  // queries execute in ~0 ms.
  const [inProgressRows, completedRows] = await Promise.all([inProgressQuery, completedQuery])

  // Collect all work IDs to batch fetch authors and first editions
  const allWorkIds = [
    ...new Set([...inProgressRows.map((r) => r.work.id), ...completedRows.map((r) => r.work.id)]),
  ]

  // Fetch blocks for all in-progress books to calculate progress
  const inProgressLogIds = inProgressRows.map((r) => r.id)

  // These depend on wave 1 but not on each other, so they form wave 2. An empty
  // id list means no query at all — `inArray` on an empty array would spend a
  // round trip to return nothing.
  const [authorsRows, blocksRows, firstEditionRows] = await Promise.all([
    allWorkIds.length > 0
      ? db
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
      : [],
    inProgressLogIds.length > 0
      ? db
          .select({
            log_id: reading_blocks.log_id,
            start_page: reading_blocks.start_page,
            end_page: reading_blocks.end_page,
          })
          .from(reading_blocks)
          .where(inArray(reading_blocks.log_id, inProgressLogIds))
      : [],
    allWorkIds.length > 0
      ? db
          .select({
            work_id: editions.work_id,
            cover_url: editions.cover_url,
            isbn13: editions.isbn13,
            ol_cover_id: editions.ol_cover_id,
            page_count: editions.page_count,
            created_at: editions.created_at,
            id: editions.id,
          })
          .from(editions)
          .where(inArray(editions.work_id, allWorkIds))
          .orderBy(editions.created_at, editions.id)
      : [],
  ])

  const authorsByWorkId = new Map<string, DashboardAuthorView[]>()
  for (const a of authorsRows) {
    let list = authorsByWorkId.get(a.work_id)
    if (!list) {
      list = []
      authorsByWorkId.set(a.work_id, list)
    }
    list.push({ id: a.id, name: a.name, slug: a.slug })
  }

  const blocksByLogId = new Map<string, Array<{ start_page: number; end_page: number }>>()
  for (const b of blocksRows) {
    let list = blocksByLogId.get(b.log_id)
    if (!list) {
      list = []
      blocksByLogId.set(b.log_id, list)
    }
    list.push({ start_page: b.start_page, end_page: b.end_page })
  }

  const firstOverallByWorkId = new Map<string, (typeof firstEditionRows)[number]>()
  const firstCoverByWorkId = new Map<string, (typeof firstEditionRows)[number]>()
  const firstIsbnByWorkId = new Map<string, (typeof firstEditionRows)[number]>()
  const firstOlByWorkId = new Map<string, (typeof firstEditionRows)[number]>()

  for (const edition of firstEditionRows) {
    if (!firstOverallByWorkId.has(edition.work_id)) {
      firstOverallByWorkId.set(edition.work_id, edition)
    }
    if (edition.cover_url !== null && !firstCoverByWorkId.has(edition.work_id)) {
      firstCoverByWorkId.set(edition.work_id, edition)
    }
    if (edition.isbn13 !== null && !firstIsbnByWorkId.has(edition.work_id)) {
      firstIsbnByWorkId.set(edition.work_id, edition)
    }
    if (edition.ol_cover_id !== null && !firstOlByWorkId.has(edition.work_id)) {
      firstOlByWorkId.set(edition.work_id, edition)
    }
  }

  const inProgress: DashboardInProgressBook[] = inProgressRows.map((row) => {
    const intervals = blocksByLogId.get(row.id) ?? []
    const firstOverall = firstOverallByWorkId.get(row.work.id)
    const firstCover = firstCoverByWorkId.get(row.work.id)
    const firstIsbn = firstIsbnByWorkId.get(row.work.id)
    const firstOl = firstOlByWorkId.get(row.work.id)
    const pageCount = row.edition_id === null ? firstOverall?.page_count ?? null : row.edition_page_count
    const calc = calculateReadingProgress(intervals, pageCount, false)

    return {
      id: row.id,
      work: {
        ...row.work,
        cover_url: firstCover?.cover_url ?? null,
        isbn13: firstIsbn?.isbn13 ?? null,
        ol_cover_id: firstOl?.ol_cover_id ?? null,
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

  const completed: DashboardCompletedBook[] = completedRows.map((row) => {
    const firstCover = firstCoverByWorkId.get(row.work.id)
    const firstIsbn = firstIsbnByWorkId.get(row.work.id)
    const firstOl = firstOlByWorkId.get(row.work.id)

    return {
      id: row.id,
      work: {
        ...row.work,
        cover_url: firstCover?.cover_url ?? null,
        isbn13: firstIsbn?.isbn13 ?? null,
        ol_cover_id: firstOl?.ol_cover_id ?? null,
        authors: authorsByWorkId.get(row.work.id) ?? [],
      },
      rating: row.rating !== null ? Number(row.rating) : null,
      review_excerpt: buildReviewExcerpt(row.review),
      finished_on: row.finished_on as string,
      finished_precision: row.finished_precision,
      created_at: row.created_at,
    }
  })

  return { inProgress, completed }
}
