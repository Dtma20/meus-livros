import { and, desc, eq } from 'drizzle-orm'
import { createError } from 'h3'
import type { WorkWithDetails } from '../../shared/schemas/work'
import { db } from '../db'
import {
  authors,
  editions,
  genres,
  reading_logs,
  users,
  work_authors,
  work_genres,
  works,
} from '../db/schema'
import { visibleLogs, type Viewer } from './visibility'
import { findDuplicateWork, findOrCreateAuthor } from './catalog'
import { slugify, uniqueSlug } from '../utils/slug'

export type { Viewer }

interface WorkBaseRow {
  id: string
  slug: string
  title: string
  original_language: string | null
  first_published_year: number | null
  series_name: string | null
  series_number: string | null
  created_by: string | null
}

async function assembleWorkDetails(
  work: WorkBaseRow,
  viewer: Viewer,
): Promise<WorkWithDetails> {
  // Four independent reads, all keyed by a work.id known before the first of
  // them. Serialised they were five sequential round trips per page, and the
  // crawler that builds the WhatsApp preview reads the first response.
  // With max: 1 in postgres.js, pipelining dispatches all four queries
  // without waiting for each response, eliminating three round-trip latencies.
  const [authorsList, genresList, editionsList, logsList] = await Promise.all([
    // 1. Authors in assigned display order
    db
      .select({
        id: authors.id,
        name: authors.name,
        slug: authors.slug,
        country_code: authors.country_code,
        country_label: authors.country_label,
      })
      .from(work_authors)
      .innerJoin(authors, eq(authors.id, work_authors.author_id))
      .where(eq(work_authors.work_id, work.id))
      .orderBy(work_authors.position),

    // 2. Genres
    db
      .select({
        id: genres.id,
        slug: genres.slug,
        label_pt: genres.label_pt,
      })
      .from(work_genres)
      .innerJoin(genres, eq(genres.id, work_genres.genre_id))
      .where(eq(work_genres.work_id, work.id))
      .orderBy(genres.id),

    // 3. Editions
    db
      .select({
        id: editions.id,
        isbn13: editions.isbn13,
        publisher: editions.publisher,
        page_count: editions.page_count,
        published_year: editions.published_year,
        language: editions.language,
        cover_url: editions.cover_url,
        ol_cover_id: editions.ol_cover_id,
      })
      .from(editions)
      .where(eq(editions.work_id, work.id))
      .orderBy(editions.published_year, editions.created_at),

    // 4. Visible reading logs for this work, newest first
    // Enforces visibleLogs(viewer) with innerJoin on users
    db
      .select({
        id: reading_logs.id,
        rating: reading_logs.rating,
        review: reading_logs.review,
        finished_on: reading_logs.finished_on,
        created_at: reading_logs.created_at,
        user: {
          id: users.id,
          handle: users.handle,
          display_name: users.display_name,
        },
      })
      .from(reading_logs)
      .innerJoin(users, eq(users.id, reading_logs.user_id))
      .where(and(eq(reading_logs.work_id, work.id), visibleLogs(viewer)))
      .orderBy(desc(reading_logs.created_at)),
  ])

  // Best available cover from editions
  const bestCoverEdition = editionsList.find((e) => e.cover_url)
    ?? editionsList.find((e) => e.ol_cover_id)
    ?? editionsList.find((e) => e.isbn13)
    ?? null

  let coverUrl: string | null = null
  if (bestCoverEdition?.cover_url) {
    coverUrl = bestCoverEdition.cover_url
  } else if (bestCoverEdition?.ol_cover_id) {
    coverUrl = `https://covers.openlibrary.org/b/id/${bestCoverEdition.ol_cover_id}-L.jpg`
  } else if (bestCoverEdition?.isbn13) {
    const clean = bestCoverEdition.isbn13.replace(/[-\s]/g, '').trim()
    if (clean) {
      coverUrl = `https://covers.openlibrary.org/b/isbn/${clean}-L.jpg?default=false`
    }
  }

  // Aggregate stats: strictly over visible logs
  const logCount = logsList.length

  const ratedLogs = logsList.filter(
    (l) => l.rating !== null && l.rating !== undefined && !Number.isNaN(Number(l.rating)),
  )

  const averageRating = ratedLogs.length > 0
    ? Math.round((ratedLogs.reduce((sum, l) => sum + Number(l.rating), 0) / ratedLogs.length) * 10) / 10
    : null

  const shapedLogs = logsList.map((l) => ({
    id: l.id,
    rating: l.rating !== null ? Number(l.rating) : null,
    review: l.review,
    finished_on: l.finished_on,
    created_at: l.created_at,
    user: l.user,
  }))

  return {
    id: work.id,
    slug: work.slug,
    title: work.title,
    original_language: work.original_language,
    first_published_year: work.first_published_year,
    series_name: work.series_name,
    series_number: work.series_number,
    cover_url: coverUrl,
    authors: authorsList,
    genres: genresList,
    editions: editionsList,
    logs: shapedLogs,
    log_count: logCount,
    average_rating: averageRating,
    created_by: work.created_by,
  }
}

/**
 * Retrieves a work by its unique slug, including authors, genres, editions,
 * and reading logs filtered by the viewer's visibility.
 *
 * Rules:
 * - Private logs are never included unless viewer is the author.
 * - Profile visibility of log authors is respected via visibleLogs(viewer).
 * - Aggregates (log_count and average_rating) only count visible logs.
 * - If not found, throws 404 with standard error code 'nao_encontrado'.
 */
export async function getWorkBySlug(slug: string, viewer: Viewer): Promise<WorkWithDetails> {
  const [work] = await db
    .select({
      id: works.id,
      slug: works.slug,
      title: works.title,
      original_language: works.original_language,
      first_published_year: works.first_published_year,
      series_name: works.series_name,
      series_number: works.series_number,
      created_by: works.created_by,
    })
    .from(works)
    .where(eq(works.slug, slug))
    .limit(1)

  if (!work) {
    throw createError({
      statusCode: 404,
      data: {
        error: 'nao_encontrado',
        message: 'Obra não encontrada.',
      },
    })
  }

  return assembleWorkDetails(work, viewer)
}

/**
 * Retrieves a work by its UUID, including authors, genres, editions,
 * and reading logs filtered by the viewer's visibility.
 */
export async function getWorkById(id: string, viewer: Viewer): Promise<WorkWithDetails> {
  const [work] = await db
    .select({
      id: works.id,
      slug: works.slug,
      title: works.title,
      original_language: works.original_language,
      first_published_year: works.first_published_year,
      series_name: works.series_name,
      series_number: works.series_number,
      created_by: works.created_by,
    })
    .from(works)
    .where(eq(works.id, id))
    .limit(1)

  if (!work) {
    throw createError({
      statusCode: 404,
      data: {
        error: 'nao_encontrado',
        message: 'Obra não encontrada.',
      },
    })
  }

  return assembleWorkDetails(work, viewer)
}

export interface ImportExternalWorkInput {
  ol_work_key?: string | null
  title: string
  authors: string[]
  first_publish_year?: number | null
  cover_url?: string | null
  ol_cover_id?: number | null
  language?: string | null
}

export async function importExternalWork(
  input: ImportExternalWorkInput,
  userId: string,
): Promise<{ id: string; slug: string; title: string }> {
  const cleanTitle = input.title.trim()
  const authorNames = input.authors.map((a) => a.trim()).filter(Boolean)
  const authorSlugs = authorNames.map((a) => slugify(a)).filter(Boolean)

  // 1. Check if work already exists by ol_work_key
  if (input.ol_work_key) {
    const [byKey] = await db
      .select({ id: works.id, slug: works.slug, title: works.title })
      .from(works)
      .where(eq(works.ol_work_key, input.ol_work_key))
      .limit(1)

    if (byKey) {
      return byKey
    }
  }

  // 2. Check if work already exists by title + authors
  if (authorSlugs.length > 0) {
    const duplicate = await findDuplicateWork(cleanTitle, authorSlugs, db)
    if (duplicate) {
      return { id: duplicate.id, slug: duplicate.slug, title: duplicate.title }
    }
  }

  // 3. Create authors
  const authorIds: string[] = []
  for (const name of authorNames) {
    authorIds.push(await findOrCreateAuthor(name, userId, undefined, db))
  }

  // 4. Generate unique slug
  const slug = await uniqueSlug(cleanTitle, async (candidate) => {
    const [row] = await db.select({ id: works.id }).from(works).where(eq(works.slug, candidate))
    return Boolean(row)
  })

  // 5. Create work and default edition in a transaction
  return db.transaction(async (tx) => {
    const [work] = await tx
      .insert(works)
      .values({
        slug,
        title: cleanTitle,
        original_language: input.language?.toLowerCase() ?? null,
        first_published_year: input.first_publish_year ?? null,
        ol_work_key: input.ol_work_key ?? null,
        created_by: userId,
      })
      .returning({ id: works.id, slug: works.slug, title: works.title })

    if (!work) throw new Error('A obra não pôde ser criada.')

    if (authorIds.length > 0) {
      await tx
        .insert(work_authors)
        .values(authorIds.map((author_id, position) => ({ work_id: work.id, author_id, position })))
        .onConflictDoNothing()
    }

    if (input.cover_url || input.ol_cover_id || input.first_publish_year) {
      await tx.insert(editions).values({
        work_id: work.id,
        cover_url: input.cover_url ?? null,
        ol_cover_id: input.ol_cover_id ?? null,
        published_year: input.first_publish_year ?? null,
        language: input.language?.toLowerCase() ?? null,
        created_by: userId,
      })
    }

    return work
  })
}
