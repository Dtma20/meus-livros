import { and, desc, eq, sql } from 'drizzle-orm'
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
  const [authorsList, genresList, editionsList, logsList, [aggregates]] = await Promise.all([
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
      .orderBy(editions.published_year, editions.created_at, editions.id)
      .limit(50),

    db
      .select({
        id: reading_logs.id,
        rating: reading_logs.rating,
        review: reading_logs.review,
        finished_on: reading_logs.finished_on,
        finished_precision: reading_logs.finished_precision,
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
      .orderBy(desc(reading_logs.created_at), desc(reading_logs.id))
      .limit(50),

    db
      .select({
        count: sql<number>`count(*)::int`,
        average: sql<string | null>`avg(${reading_logs.rating})`,
      })
      .from(reading_logs)
      .innerJoin(users, eq(users.id, reading_logs.user_id))
      .where(and(eq(reading_logs.work_id, work.id), visibleLogs(viewer))),
  ])

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

  const logCount = aggregates?.count ?? 0
  const averageRating = aggregates?.average
    ? Math.round(Number(aggregates.average) * 10) / 10
    : null

  const shapedLogs = logsList.map((l) => ({
    id: l.id,
    rating: l.rating !== null ? Number(l.rating) : null,
    review: l.review,
    finished_on: l.finished_on,
    finished_precision: l.finished_precision,
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
