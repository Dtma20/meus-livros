import { and, eq, inArray, sql } from 'drizzle-orm'
import { createError } from 'h3'
import type {
  ProfileAuthorView,
  ProfileGenreView,
  ProfileLogItem,
  ProfileResponse,
  ProfileStats,
  ProfileUserView,
} from '../../shared/schemas/profile'
import { formatCountryName } from '../../shared/schemas/profile'
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

/**
 * Service to fetch a user profile and their visible reading logs.
 *
 * Rules:
 * - A `privado` profile returns 404 (never 403) to everyone except its owner.
 * - Non-existent handle returns 404.
 * - Logs and stats are strictly filtered by `visibleLogs(viewer)`.
 * - For non-owners, private entries are excluded from both logs and counters.
 */
export async function getProfileByHandle(
  handle: string,
  viewer: Viewer,
): Promise<ProfileResponse> {
  const normalized = handle.trim().toLowerCase()
  if (!normalized) {
    throw createError({
      statusCode: 404,
      data: {
        error: 'nao_encontrado',
        message: 'Perfil não encontrado.',
      },
    })
  }

  // 1. Fetch user by handle
  const [userRow] = await db
    .select({
      id: users.id,
      handle: users.handle,
      display_name: users.display_name,
      bio: users.bio,
      profile_visibility: users.profile_visibility,
      created_at: users.created_at,
    })
    .from(users)
    .where(eq(users.handle, normalized))
    .limit(1)

  if (!userRow) {
    throw createError({
      statusCode: 404,
      data: {
        error: 'nao_encontrado',
        message: 'Perfil não encontrado.',
      },
    })
  }

  // 2. Private profile visibility check: 404 to all non-owners (never 403)
  const isOwner = viewer !== null && viewer.id === userRow.id
  if (userRow.profile_visibility === 'privado' && !isOwner) {
    throw createError({
      statusCode: 404,
      data: {
        error: 'nao_encontrado',
        message: 'Perfil não encontrado.',
      },
    })
  }

  // 3. Query reading logs for this user, enforcing visibleLogs(viewer)
  const logRows = await db
    .select({
      id: reading_logs.id,
      work_id: reading_logs.work_id,
      edition_id: reading_logs.edition_id,
      rating: reading_logs.rating,
      review: reading_logs.review,
      started_on: reading_logs.started_on,
      finished_on: reading_logs.finished_on,
      finished_precision: reading_logs.finished_precision,
      format: reading_logs.format,
      visibility: reading_logs.visibility,
      created_at: reading_logs.created_at,
      work: {
        id: works.id,
        title: works.title,
        slug: works.slug,
        first_published_year: works.first_published_year,
        cover_url: sql<string | null>`(
          SELECT e.cover_url FROM editions e WHERE e.work_id = works.id AND e.cover_url IS NOT NULL LIMIT 1
        )`,
      },
      edition: {
        id: editions.id,
        isbn13: editions.isbn13,
        publisher: editions.publisher,
        cover_url: editions.cover_url,
        ol_cover_id: editions.ol_cover_id,
        page_count: editions.page_count,
        published_year: editions.published_year,
      },
    })
    .from(reading_logs)
    .innerJoin(users, eq(users.id, reading_logs.user_id))
    .innerJoin(works, eq(works.id, reading_logs.work_id))
    .leftJoin(editions, eq(editions.id, reading_logs.edition_id))
    .where(and(eq(reading_logs.user_id, userRow.id), visibleLogs(viewer)))
    .orderBy(sql`${reading_logs.finished_on} DESC NULLS LAST, ${reading_logs.created_at} DESC`)

  const userView: ProfileUserView = {
    id: userRow.id,
    handle: userRow.handle,
    display_name: userRow.display_name,
    bio: userRow.bio,
    profile_visibility: userRow.profile_visibility,
    created_at: userRow.created_at,
  }

  if (logRows.length === 0) {
    const emptyStats: ProfileStats = {
      totalBooks: 0,
      uniqueAuthors: 0,
      uniqueCountries: 0,
      totalPages: 0,
      averagePages: 0,
    }
    return {
      user: userView,
      logs: [],
      stats: emptyStats,
    }
  }

  // 4. Batch query authors and genres for all retrieved works
  const workIds = [...new Set(logRows.map((r) => r.work.id))]

  const authorsRows = await db
    .select({
      work_id: work_authors.work_id,
      id: authors.id,
      name: authors.name,
      slug: authors.slug,
      country_code: authors.country_code,
      country_label: authors.country_label,
      position: work_authors.position,
    })
    .from(work_authors)
    .innerJoin(authors, eq(authors.id, work_authors.author_id))
    .where(inArray(work_authors.work_id, workIds))
    .orderBy(work_authors.position)

  const authorsByWorkId = new Map<string, ProfileAuthorView[]>()
  for (const row of authorsRows) {
    let list = authorsByWorkId.get(row.work_id)
    if (!list) {
      list = []
      authorsByWorkId.set(row.work_id, list)
    }
    list.push({
      id: row.id,
      name: row.name,
      slug: row.slug,
      country_code: row.country_code,
      country_label: row.country_label,
    })
  }

  const genresRows = await db
    .select({
      work_id: work_genres.work_id,
      id: genres.id,
      slug: genres.slug,
      label_pt: genres.label_pt,
    })
    .from(work_genres)
    .innerJoin(genres, eq(genres.id, work_genres.genre_id))
    .where(inArray(work_genres.work_id, workIds))

  const genresByWorkId = new Map<string, ProfileGenreView[]>()
  for (const row of genresRows) {
    let list = genresByWorkId.get(row.work_id)
    if (!list) {
      list = []
      genresByWorkId.set(row.work_id, list)
    }
    list.push({
      id: row.id,
      slug: row.slug,
      label_pt: row.label_pt,
    })
  }

  // 5. Construct ProfileLogItem array
  const logs: ProfileLogItem[] = logRows.map((row) => ({
    id: row.id,
    rating: row.rating !== null ? Number(row.rating) : null,
    review: row.review,
    started_on: row.started_on,
    finished_on: row.finished_on,
    finished_precision: row.finished_precision,
    format: row.format,
    visibility: row.visibility,
    created_at: row.created_at,
    work: {
      id: row.work.id,
      title: row.work.title,
      slug: row.work.slug,
      first_published_year: row.work.first_published_year,
      cover_url: row.work.cover_url,
      authors: authorsByWorkId.get(row.work.id) ?? [],
      genres: genresByWorkId.get(row.work.id) ?? [],
    },
    edition: row.edition_id ? row.edition : null,
  }))

  // 6. Compute stats over the visible logs
  const totalBooks = logs.length
  const authorSet = new Set<string>()
  const countrySet = new Set<string>()
  let totalPages = 0

  for (const log of logs) {
    for (const author of log.work.authors) {
      authorSet.add(author.name || author.id)
      const country = formatCountryName(author.country_code, author.country_label)
      if (country) {
        countrySet.add(country)
      }
    }
    totalPages += log.edition?.page_count || 0
  }

  const averagePages = totalBooks === 0 ? 0 : Math.round(totalPages / totalBooks)

  const stats: ProfileStats = {
    totalBooks,
    uniqueAuthors: authorSet.size,
    uniqueCountries: countrySet.size,
    totalPages,
    averagePages,
  }

  return {
    user: userView,
    logs,
    stats,
  }
}
