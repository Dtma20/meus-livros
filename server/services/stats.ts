import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { formatCountryName } from '../../shared/schemas/profile'
import {
  languageLabel,
  type StatsCount,
  type StatsResponse,
} from '../../shared/schemas/stats'
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

export async function getReadingStats(
  handle: string,
  viewer: Viewer,
  year?: number | null,
): Promise<StatsResponse> {
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

  const [userRow] = await db
    .select({
      id: users.id,
      handle: users.handle,
      display_name: users.display_name,
      profile_visibility: users.profile_visibility,
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

  const selectedYear = year !== undefined ? year : null

  const yearRows = await db
    .selectDistinct({
      year: sql<number>`EXTRACT(YEAR FROM ${reading_logs.finished_on})::int`,
    })
    .from(reading_logs)
    .innerJoin(users, eq(users.id, reading_logs.user_id))
    .where(
      and(
        eq(reading_logs.user_id, userRow.id),
        isNotNull(reading_logs.finished_on),
        visibleLogs(viewer),
      ),
    )
    .orderBy(sql`EXTRACT(YEAR FROM ${reading_logs.finished_on})::int ASC`)

  const years = yearRows
    .map((r) => Number(r.year))
    .filter((y) => !Number.isNaN(y))

  const logConditions = [
    eq(reading_logs.user_id, userRow.id),
    isNotNull(reading_logs.finished_on),
    visibleLogs(viewer),
  ]

  if (selectedYear !== null) {
    logConditions.push(sql`EXTRACT(YEAR FROM ${reading_logs.finished_on})::int = ${selectedYear}`)
  }

  const logRows = await db
    .select({
      id: reading_logs.id,
      work_id: reading_logs.work_id,
      edition_id: reading_logs.edition_id,
      rating: reading_logs.rating,
      finished_on: reading_logs.finished_on,
      reading_year: sql<number>`EXTRACT(YEAR FROM ${reading_logs.finished_on})::int`,
      format: reading_logs.format,
      edition_page_count: editions.page_count,
      original_language: works.original_language,
    })
    .from(reading_logs)
    .innerJoin(users, eq(users.id, reading_logs.user_id))
    .innerJoin(works, eq(works.id, reading_logs.work_id))
    .leftJoin(editions, eq(editions.id, reading_logs.edition_id))
    .where(and(...logConditions))

  if (logRows.length === 0) {
    return {
      user: {
        handle: userRow.handle,
        display_name: userRow.display_name,
      },
      year: selectedYear,
      years,
      totals: {
        books: 0,
        pages: 0,
        authors: 0,
        countries: 0,
        averageRating: null,
      },
      byYear: selectedYear !== null ? [{ year: selectedYear, books: 0, pages: 0 }] : [],
      genres: [],
      authors: [],
      countries: [],
      languages: [],
      ratings: [],
      formats: [],
    }
  }

  const workIds = [...new Set(logRows.map((r) => r.work_id))]

  const [authorsRows, genresRows, firstEditionRows] = await Promise.all([
    db
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
      .orderBy(work_authors.position),
    db
      .select({
        work_id: work_genres.work_id,
        id: genres.id,
        slug: genres.slug,
        label_pt: genres.label_pt,
      })
      .from(work_genres)
      .innerJoin(genres, eq(genres.id, work_genres.genre_id))
      .where(inArray(work_genres.work_id, workIds)),
    db
      .select({
        work_id: editions.work_id,
        id: editions.id,
        page_count: editions.page_count,
        created_at: editions.created_at,
      })
      .from(editions)
      .where(inArray(editions.work_id, workIds))
      .orderBy(editions.created_at, editions.id),
  ])

  const authorsByWorkId = new Map<string, typeof authorsRows>()
  for (const row of authorsRows) {
    let list = authorsByWorkId.get(row.work_id)
    if (!list) {
      list = []
      authorsByWorkId.set(row.work_id, list)
    }
    list.push(row)
  }

  const genresByWorkId = new Map<string, typeof genresRows>()
  for (const row of genresRows) {
    let list = genresByWorkId.get(row.work_id)
    if (!list) {
      list = []
      genresByWorkId.set(row.work_id, list)
    }
    list.push(row)
  }

  const firstEditionByWorkId = new Map<string, (typeof firstEditionRows)[number]>()
  for (const edition of firstEditionRows) {
    if (!firstEditionByWorkId.has(edition.work_id)) {
      firstEditionByWorkId.set(edition.work_id, edition)
    }
  }

  let totalBooks = 0
  let totalPages = 0
  let sumRatings = 0
  let ratedCount = 0

  const byYearMap = new Map<number, { books: number; pages: number }>()
  const authorCounts = new Map<string, { label: string; slug: string; count: number }>()
  const countryCounts = new Map<string, number>()
  const genreCounts = new Map<string, number>()
  const languageCounts = new Map<string, number>()
  const ratingCounts = new Map<number, number>()
  const formatCounts = new Map<'fisico' | 'ebook' | 'audio' | null, number>()

  for (const log of logRows) {
    totalBooks += 1

    const pages = log.edition_id !== null
      ? log.edition_page_count ?? 0
      : firstEditionByWorkId.get(log.work_id)?.page_count ?? 0
    totalPages += pages

    const logYear = Number(log.reading_year)
    if (!Number.isNaN(logYear)) {
      const yearStat = byYearMap.get(logYear) ?? { books: 0, pages: 0 }
      yearStat.books += 1
      yearStat.pages += pages
      byYearMap.set(logYear, yearStat)
    }

    if (log.rating !== null && log.rating !== undefined) {
      const r = Number(log.rating)
      if (!Number.isNaN(r)) {
        sumRatings += r
        ratedCount += 1
        ratingCounts.set(r, (ratingCounts.get(r) ?? 0) + 1)
      }
    }

    const fmt = (log.format as 'fisico' | 'ebook' | 'audio' | null) ?? null
    formatCounts.set(fmt, (formatCounts.get(fmt) ?? 0) + 1)

    const langLabel = languageLabel(log.original_language)
    languageCounts.set(langLabel, (languageCounts.get(langLabel) ?? 0) + 1)

    const workGenres = genresByWorkId.get(log.work_id) ?? []
    const seenGenresForLog = new Set<string>()
    for (const g of workGenres) {
      if (!seenGenresForLog.has(g.label_pt)) {
        seenGenresForLog.add(g.label_pt)
        genreCounts.set(g.label_pt, (genreCounts.get(g.label_pt) ?? 0) + 1)
      }
    }

    const workAuthors = authorsByWorkId.get(log.work_id) ?? []
    const seenAuthorsForLog = new Set<string>()
    const seenCountriesForLog = new Set<string>()

    for (const a of workAuthors) {
      if (!seenAuthorsForLog.has(a.slug)) {
        seenAuthorsForLog.add(a.slug)
        const current = authorCounts.get(a.slug) ?? {
          label: a.name,
          slug: a.slug,
          count: 0,
        }
        current.count += 1
        authorCounts.set(a.slug, current)
      }

      const country = formatCountryName(a.country_code, a.country_label)
      if (country && country.trim()) {
        seenCountriesForLog.add(country.trim())
      }
    }

    for (const country of seenCountriesForLog) {
      countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1)
    }
  }

  const averageRating = ratedCount > 0 ? Math.round((sumRatings / ratedCount) * 10) / 10 : null

  const byYear = selectedYear !== null
    ? [{ year: selectedYear, books: totalBooks, pages: totalPages }]
    : [...byYearMap.entries()]
        .sort(([a], [b]) => a - b)
        .map(([yearKey, val]) => ({
          year: yearKey,
          books: val.books,
          pages: val.pages,
        }))

  const genreStats: StatsCount[] = [...genreCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'))
    .slice(0, 8)

  const authorsResult: (StatsCount & { slug: string })[] = [...authorCounts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'))
    .slice(0, 8)

  const countries: StatsCount[] = [...countryCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'))

  const languages: StatsCount[] = [...languageCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'))

  const ratings = [...ratingCounts.entries()]
    .map(([rating, count]) => ({ rating, count }))
    .sort((a, b) => a.rating - b.rating)

  const formatOrder: Array<'fisico' | 'ebook' | 'audio' | null> = [
    'fisico',
    'ebook',
    'audio',
    null,
  ]
  const formats: { format: 'fisico' | 'ebook' | 'audio' | null; count: number }[] = []
  for (const fmt of formatOrder) {
    const count = formatCounts.get(fmt) ?? 0
    if (count > 0) {
      formats.push({ format: fmt, count })
    }
  }
  formats.sort((a, b) => b.count - a.count || formatOrder.indexOf(a.format) - formatOrder.indexOf(b.format))

  return {
    user: {
      handle: userRow.handle,
      display_name: userRow.display_name,
    },
    year: selectedYear,
    years,
    totals: {
      books: totalBooks,
      pages: totalPages,
      authors: authorCounts.size,
      countries: countryCounts.size,
      averageRating,
    },
    byYear,
    genres: genreStats,
    authors: authorsResult,
    countries,
    languages,
    ratings,
    formats,
  }
}
