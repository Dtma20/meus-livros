import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../db'
import {
  authors,
  editions,
  genres,
  reading_logs,
  work_authors,
  work_genres,
  works,
} from '../db/schema'
import { normalizeIsbn } from '../utils/isbn'
import { slugify } from '../utils/slug'
import { logger } from '../utils/logger'
import { COUNTRIES, countryCodeFor, countryLabelFor } from '../../shared/constants/countries'
import { importPagesSchema, type LivroJson, type ImportResult } from '../../shared/schemas/export-import'
import { coverUrlSchema, publicationYearSchema } from '../../shared/schemas/work'

import {
  getTodaySaoPaulo,
  isFutureDateSaoPaulo,
  logVisibilitySchema,
  ratingSchema,
  reviewSchema,
  type DatePrecision,
  type LogVisibility,
} from '../../shared/schemas/log'

const VALID_COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.code))

export const ISO_IDIOMA: Record<string, string> = {
  'inglês': 'en',
  'português': 'pt',
  'alemão': 'de',
  'russo': 'ru',
  'francês': 'fr',
  'chinês': 'zh',
  'hebraico': 'he',
  'norueguês': 'no',
  'latim': 'la',
  'espanhol': 'es',
  'japonês': 'ja',
}

export const IDIOMA_ISO_REVERSE: Record<string, string> = {
  'en': 'inglês',
  'pt': 'português',
  'de': 'alemão',
  'ru': 'russo',
  'fr': 'francês',
  'zh': 'chinês',
  'he': 'hebraico',
  'no': 'norueguês',
  'la': 'latim',
  'es': 'espanhol',
  'ja': 'japonês',
}

// Every value must be a slug from the seed in scripts/seed-genres.ts (checked by the integration suite).
// Labels with no seed equivalent (Sociologia, Psicologia, Religião) are left out on purpose: the import
// then reports them in errors[] instead of dropping them silently.
export const GENRE_SLUG_MAP: Record<string, string> = {
  'Ficção': 'ficcao',
  'Não-Ficção': 'nao-ficcao',
  'Romance': 'romance',
  'Aventura': 'aventura',
  'Fantasia': 'fantasia',
  'Sci-fi': 'ficcao-cientifica',
  'Novela': 'novela',
  'Mistério': 'misterio',
  'Distopia': 'distopia',
  'Contos': 'contos',
  'Terror': 'terror',
  'História': 'historia',
  'Biografia': 'biografia',
  'Autobiografia': 'biografia',
  'Política': 'politica',
  'Filosofia': 'filosofia',
  'Divulgação Científica': 'ciencia',
  'Ensaio': 'ensaio',
  'Crônica': 'ensaio',
  'Poesia': 'poesia',
  'Teatro': 'dramaturgia',
  'HQ': 'graphic-novel',
  'Mangá': 'graphic-novel',
}

export function parseAuthors(raw: string): string[] {
  if (!raw || !raw.trim()) return []
  return raw
    .split(/,| e |;|\//g)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function parseFormat(source?: string | null): 'fisico' | 'ebook' | 'audio' | null {
  if (source === null || source === undefined) return null
  const trimmed = source.trim()
  if (trimmed === '') return null
  const lower = trimmed.toLowerCase()
  if (lower.includes('kindle') || lower.includes('ebook') || lower.includes('e-book') || lower.includes('digital')) {
    return 'ebook'
  }
  if (lower.includes('audio') || lower.includes('áudio')) {
    return 'audio'
  }
  return 'fisico'
}

export function formatSourceLabel(format?: string | null): string | null {
  if (format === 'ebook') return 'Kindle'
  if (format === 'audio') return 'Audiobook'
  if (format === 'fisico') return 'Físico'
  return null
}

export function formatImportError(bookIndex: number, title: string): string {
  return `Livro #${bookIndex} ("${title}"): não foi possível importar.`
}

export function parseImportVisibility(value: string | null | undefined): LogVisibility {
  if (value === undefined || value === null) return 'publico'
  const parsed = logVisibilitySchema.safeParse(value)
  if (!parsed.success) throw new Error('Visibilidade inválida.')
  return parsed.data
}

type ReadInResult =
  | { ok: true; finishedOn: string | null; finishedPrecision: DatePrecision }
  | { ok: false; reason: string }

export type ReadingDates =
  | { ok: true; startedOn: string | null; finishedOn: string | null; finishedPrecision: DatePrecision }
  | { ok: false; reason: string }

const NO_READ_DATE: ReadInResult = { ok: true, finishedOn: null, finishedPrecision: 'ano' }

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

function isCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 1 || month < 1 || month > 12 || day < 1) return false
  return day <= daysInMonth(year, month)
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

function isValidDateOnly(value: string): boolean {
  const match = DATE_ONLY.exec(value)
  return match !== null && isCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))
}

// Year-only input: a 4-digit year that is not in the future (America/Sao_Paulo).
function parseReadInYear(yearText: string, raw: string, todaySp: string): ReadInResult {
  const year = Number(yearText)
  if (year < 1) return { ok: false, reason: `ano de leitura "${raw}" inválido.` }
  if (year > Number(todaySp.slice(0, 4))) return { ok: false, reason: `data de leitura "${raw}" está no futuro.` }
  return { ok: true, finishedOn: `${yearText}-01-01`, finishedPrecision: 'ano' }
}

// read_in accepts a 4-digit year (number or YYYY), YYYY-MM, or YYYY-MM-DD. It never invents a date:
// anything else is reported and the item is refused. Negative years (legacy, e.g. -500) keep the old behaviour.
export function parseReadIn(readIn: LivroJson['read_in'], now: Date = new Date()): ReadInResult {
  if (readIn === null || readIn === undefined) return NO_READ_DATE
  const todaySp = getTodaySaoPaulo(now)

  if (typeof readIn === 'number') {
    if (readIn < 0) return { ok: true, finishedOn: `${readIn}-01-01`, finishedPrecision: 'ano' }
    if (!Number.isInteger(readIn) || readIn < 1000 || readIn > 9999) {
      return { ok: false, reason: `ano de leitura "${readIn}" fora do padrão: use 4 dígitos.` }
    }
    return parseReadInYear(String(readIn), String(readIn), todaySp)
  }

  const trimmed = readIn.trim()
  if (trimmed === '') return NO_READ_DATE

  if (/^\d{4}$/.test(trimmed)) return parseReadInYear(trimmed, trimmed, todaySp)

  const monthMatch = /^(\d{4})-(\d{2})$/.exec(trimmed)
  if (monthMatch) {
    const year = Number(monthMatch[1])
    const month = Number(monthMatch[2])
    if (!isCalendarDate(year, month, 1)) {
      return { ok: false, reason: `data de leitura "${trimmed}" não existe no calendário.` }
    }
    if (`${monthMatch[1]}-${monthMatch[2]}` > todaySp.slice(0, 7)) {
      return { ok: false, reason: `data de leitura "${trimmed}" está no futuro.` }
    }
    return { ok: true, finishedOn: `${monthMatch[1]}-${monthMatch[2]}-01`, finishedPrecision: 'mes' }
  }

  if (DATE_ONLY.test(trimmed)) {
    if (!isValidDateOnly(trimmed)) {
      return { ok: false, reason: `data de leitura "${trimmed}" não existe no calendário.` }
    }
    if (isFutureDateSaoPaulo(trimmed, now)) {
      return { ok: false, reason: `data de leitura "${trimmed}" está no futuro.` }
    }
    return { ok: true, finishedOn: trimmed, finishedPrecision: 'dia' }
  }

  return { ok: false, reason: `data de leitura "${trimmed}" fora do padrão: use AAAA, AAAA-MM ou AAAA-MM-DD.` }
}

// Last day of the period that a stored month or year date stands for.
function periodEnd(finishedOn: string, precision: DatePrecision): string {
  if (precision === 'mes') {
    const year = Number(finishedOn.slice(0, 4))
    const month = Number(finishedOn.slice(5, 7))
    return `${finishedOn.slice(0, 7)}-${String(daysInMonth(year, month)).padStart(2, '0')}`
  }
  return `${finishedOn.slice(0, 4)}-12-31`
}

// Validates started_on and finished_on together for one item. Month and year precision store the first day
// of the period, so a start inside that same period cannot sit before the stored date. The stored finish
// then moves to the start day: the earliest date compatible with the file. Anything else is refused.
export function parseReadingDates(book: LivroJson, now: Date = new Date()): ReadingDates {
  const readIn = parseReadIn(book.read_in, now)
  if (!readIn.ok) return { ok: false, reason: readIn.reason }

  let finishedOn = readIn.finishedOn
  // With no finish date, the file's precision is kept; otherwise the default a manual reading gets (logInputSchema).
  const finishedPrecision = finishedOn === null ? (book.finished_precision ?? 'dia') : readIn.finishedPrecision

  if (finishedOn !== null && book.finished_precision && book.finished_precision !== finishedPrecision) {
    return {
      ok: false,
      reason: `precisão de término "${book.finished_precision}" não confere com a data de leitura.`,
    }
  }

  const startedOn = book.started_on?.trim() || null
  if (startedOn !== null) {
    if (!isValidDateOnly(startedOn)) {
      return { ok: false, reason: `data de início "${startedOn}" inválida: use AAAA-MM-DD.` }
    }
    if (isFutureDateSaoPaulo(startedOn, now)) {
      return { ok: false, reason: `data de início "${startedOn}" está no futuro.` }
    }
  }

  if (startedOn !== null && finishedOn !== null && startedOn > finishedOn) {
    if (finishedPrecision !== 'dia' && startedOn <= periodEnd(finishedOn, finishedPrecision)) {
      finishedOn = startedOn
    } else {
      return { ok: false, reason: 'data de início posterior à data de término.' }
    }
  }

  return { ok: true, startedOn, finishedOn, finishedPrecision }
}

export async function exportUserLibrary(userId: string): Promise<LivroJson[]> {
  logger.info(`Exportando biblioteca do usuário ${userId}`, { module: 'export', userId })

  const logs = await db
    .select({
      id: reading_logs.id,
      rating: reading_logs.rating,
      review: reading_logs.review,
      started_on: reading_logs.started_on,
      finished_on: reading_logs.finished_on,
      finished_precision: reading_logs.finished_precision,
      format: reading_logs.format,
      visibility: reading_logs.visibility,
      work_id: works.id,
      title: works.title,
      original_language: works.original_language,
      first_published_year: works.first_published_year,
      series_name: works.series_name,
      series_number: works.series_number,
      edition_id: editions.id,
      isbn13: editions.isbn13,
      publisher: editions.publisher,
      page_count: editions.page_count,
      cover_url: editions.cover_url,
    })
    .from(reading_logs)
    .innerJoin(works, eq(works.id, reading_logs.work_id))
    .leftJoin(editions, eq(editions.id, reading_logs.edition_id))
    .where(eq(reading_logs.user_id, userId))
    .orderBy(desc(reading_logs.finished_on), desc(reading_logs.created_at))

  if (logs.length === 0) {
    return []
  }

  const workIds = [...new Set(logs.map((l) => l.work_id))]

  const authorRows = await db
    .select({
      work_id: work_authors.work_id,
      name: authors.name,
      country_code: authors.country_code,
      country_label: authors.country_label,
    })
    .from(work_authors)
    .innerJoin(authors, eq(authors.id, work_authors.author_id))
    .where(inArray(work_authors.work_id, workIds))
    .orderBy(work_authors.position)

  const authorsByWork = new Map<string, Array<{ name: string; country: string | null; country_code: string | null }>>()
  for (const a of authorRows) {
    let list = authorsByWork.get(a.work_id)
    if (!list) {
      list = []
      authorsByWork.set(a.work_id, list)
    }
    const rawCode = a.country_code?.trim().toUpperCase() || null
    const validCode = (rawCode && VALID_COUNTRY_CODES.has(rawCode)) ? rawCode : null
    const countryCode = validCode ?? countryCodeFor(a.country_label)
    const country = (a.country_label?.trim() || (countryCode ? countryLabelFor(countryCode) : null)) ?? null
    list.push({ name: a.name, country, country_code: countryCode ?? null })
  }

  const genreRows = await db
    .select({
      work_id: work_genres.work_id,
      label_pt: genres.label_pt,
    })
    .from(work_genres)
    .innerJoin(genres, eq(genres.id, work_genres.genre_id))
    .where(inArray(work_genres.work_id, workIds))

  const genresByWork = new Map<string, string[]>()
  for (const g of genreRows) {
    let list = genresByWork.get(g.work_id)
    if (!list) {
      list = []
      genresByWork.set(g.work_id, list)
    }
    list.push(g.label_pt)
  }

  return logs.map((log) => {
    const workAuthorsList = authorsByWork.get(log.work_id) ?? []
    const authorStr = workAuthorsList.map((a) => a.name).join(', ') || 'Autor Desconhecido'
    const country = workAuthorsList[0]?.country ?? null
    const countryCode = workAuthorsList[0]?.country_code ?? null
    const lang = log.original_language ? (IDIOMA_ISO_REVERSE[log.original_language] ?? log.original_language) : null

    let readIn: number | string | null = null
    if (log.finished_on) {
      if (log.finished_precision === 'ano') {
        readIn = parseInt(log.finished_on.split('-')[0] ?? '', 10) || null
      } else if (log.finished_precision === 'mes') {
        readIn = log.finished_on.slice(0, 7)
      } else {
        readIn = log.finished_on
      }
    }

    return {
      title: log.title,
      author: authorStr,
      country,
      country_code: countryCode,
      original_language: lang,
      year: log.first_published_year,
      publisher: log.publisher ?? null,
      pages: log.page_count ?? null,
      read_in: readIn,
      started_on: log.started_on ?? null,
      finished_precision: log.finished_precision,
      rate: log.rating ? Number(log.rating) : null,
      review: log.review,
      source: formatSourceLabel(log.format),
      series_name: log.series_name,
      series_number: log.series_number,
      genre: genresByWork.get(log.work_id) ?? [],
      isbn: log.isbn13 ?? null,
      cover_url: log.cover_url,
      visibility: log.visibility,
    }
  })
}

export async function importUserLibrary(userId: string, books: LivroJson[]): Promise<ImportResult> {
  logger.info(`Iniciando importação de ${books.length} livros para o usuário ${userId}`, {
    module: 'import',
    userId,
    count: books.length,
  })

  const allGenres = await db.select().from(genres)
  const genreSlugToId = new Map<string, number>()
  const genreLabelToId = new Map<string, number>()
  for (const g of allGenres) {
    genreSlugToId.set(g.slug, g.id)
    genreLabelToId.set(g.label_pt.toLowerCase(), g.id)
  }

  let importedCount = 0
  let skippedCount = 0
  const errors: string[] = []
  // The export lists the newest reading first, and the library sorts ties on finish date by created_at DESC.
  // Item i gets created_at = start - i ms, so the file order is kept among readings with the same finish date.
  const importStartMs = Date.now()

  for (let i = 0; i < books.length; i++) {
    const book = books[i]!
    const bookIndex = i + 1

    try {
      const visibility = parseImportVisibility(book.visibility)

      // Refuses this item only, before any row is written for it.
      const dates = parseReadingDates(book)
      if (!dates.ok) {
        errors.push(`${formatImportError(bookIndex, book.title)} Motivo: ${dates.reason}`)
        skippedCount++
        continue
      }

      if (book.rate !== null && book.rate !== undefined) {
        const parsedRate = ratingSchema.safeParse(book.rate)
        if (!parsedRate.success) {
          const reason = parsedRate.error.issues[0]?.message ?? 'nota inválida.'
          errors.push(`${formatImportError(bookIndex, book.title)} Motivo: ${reason}`)
          skippedCount++
          continue
        }
      }

      if (book.review !== null && book.review !== undefined) {
        const parsedReview = reviewSchema.safeParse(book.review)
        if (!parsedReview.success) {
          const reason = parsedReview.error.issues[0]?.message ?? 'resenha inválida.'
          errors.push(`${formatImportError(bookIndex, book.title)} Motivo: ${reason}`)
          skippedCount++
          continue
        }
      }

      let validYear: number | null = null
      if (book.year !== null && book.year !== undefined) {
        const parsedYear = publicationYearSchema.safeParse(book.year)
        if (!parsedYear.success) {
          const reason = parsedYear.error.issues[0]?.message ?? 'ano inválido.'
          errors.push(`${formatImportError(bookIndex, book.title)} Motivo: ${reason}`)
          skippedCount++
          continue
        }
        validYear = parsedYear.data
      }

      let validPages: number | null = null
      if (book.pages !== null && book.pages !== undefined) {
        const parsedPages = importPagesSchema.safeParse(book.pages)
        if (!parsedPages.success) {
          const reason = parsedPages.error.issues[0]?.message ?? 'número de páginas inválido.'
          errors.push(`${formatImportError(bookIndex, book.title)} Motivo: ${reason}`)
          skippedCount++
          continue
        }
        validPages = parsedPages.data
      }

      let validCoverUrl: string | null = null
      if (book.cover_url !== null && book.cover_url !== undefined) {
        const parsedCoverUrl = coverUrlSchema.safeParse(book.cover_url)
        if (!parsedCoverUrl.success) {
          const reason = parsedCoverUrl.error.issues[0]?.message ?? 'URL da capa inválida.'
          errors.push(`${formatImportError(bookIndex, book.title)} Motivo: ${reason}`)
          skippedCount++
          continue
        }
        validCoverUrl = parsedCoverUrl.data
      }

      // Warnings for an item are reported only once that item commits.
      const itemWarnings: string[] = []

      await db.transaction(async (tx) => {
        const authorNames = parseAuthors(book.author)
        if (authorNames.length === 0) authorNames.push('Autor Desconhecido')

        const authorIds: string[] = []
        for (const aName of authorNames) {
          const aSlug = slugify(aName)
          if (!aSlug) continue

          const [existingAuthor] = await tx
            .select({ id: authors.id })
            .from(authors)
            .where(eq(authors.slug, aSlug))

          if (existingAuthor) {
            authorIds.push(existingAuthor.id)
          } else {
            const rawCountryCode = typeof book.country_code === 'string' ? book.country_code.trim().toUpperCase() : null
            const validCountryCode = (rawCountryCode && VALID_COUNTRY_CODES.has(rawCountryCode)) ? rawCountryCode : null
            const authorCountryCode = validCountryCode ?? countryCodeFor(book.country)
            const authorCountryLabel = book.country?.trim() || (authorCountryCode ? countryLabelFor(authorCountryCode) : null)

            const [newAuthor] = await tx
              .insert(authors)
              .values({
                name: aName,
                slug: aSlug,
                country_code: authorCountryCode,
                country_label: authorCountryLabel,
                created_by: userId,
              })
              .onConflictDoNothing()
              .returning({ id: authors.id })

            if (newAuthor) {
              authorIds.push(newAuthor.id)
            } else {
              const [rechecked] = await tx
                .select({ id: authors.id })
                .from(authors)
                .where(eq(authors.slug, aSlug))
              if (rechecked) authorIds.push(rechecked.id)
            }
          }
        }

        const baseSlug = slugify(book.title) || 'obra'
        let workId: string | null = null

        const authorSlugs = authorNames.map(slugify).filter(Boolean)
        if (authorSlugs.length > 0) {
          const candidates = await tx
            .select({ id: works.id })
            .from(works)
            .innerJoin(work_authors, eq(work_authors.work_id, works.id))
            .innerJoin(authors, eq(authors.id, work_authors.author_id))
            .where(
              and(
                sql`f_unaccent(lower(${works.title})) = f_unaccent(lower(${book.title}))`,
                inArray(authors.slug, authorSlugs),
              ),
            )
            .limit(1)

          if (candidates[0]) {
            workId = candidates[0].id
          }
        }

        const langIso = book.original_language
          ? (ISO_IDIOMA[book.original_language.toLowerCase()] ?? book.original_language.toLowerCase().slice(0, 2))
          : null

        if (!workId) {
          let finalSlug = baseSlug
          let suffix = 1
          while (true) {
            const [collision] = await tx.select({ id: works.id }).from(works).where(eq(works.slug, finalSlug))
            if (!collision) break
            suffix++
            finalSlug = `${baseSlug}-${suffix}`
          }

          const [createdWork] = await tx
            .insert(works)
            .values({
              title: book.title.trim(),
              slug: finalSlug,
              original_language: langIso,
              first_published_year: validYear,
              series_name: book.series_name ?? null,
              series_number: book.series_number ?? null,
              created_by: userId,
            })
            .returning({ id: works.id })

          workId = createdWork!.id

          for (let pos = 0; pos < authorIds.length; pos++) {
            await tx
              .insert(work_authors)
              .values({
                work_id: workId,
                author_id: authorIds[pos]!,
                position: pos,
              })
              .onConflictDoNothing()
          }

          if (book.genre && book.genre.length > 0) {
            for (const gName of book.genre) {
              const mappedSlug = GENRE_SLUG_MAP[gName] ?? slugify(gName)
              const gId = genreSlugToId.get(mappedSlug) ?? genreLabelToId.get(gName.toLowerCase())
              if (gId) {
                await tx
                  .insert(work_genres)
                  .values({
                    work_id: workId,
                    genre_id: gId,
                  })
                  .onConflictDoNothing()
              } else {
                itemWarnings.push(`Livro #${bookIndex} ("${book.title}"): gênero "${gName}" não existe no catálogo; ignorado.`)
              }
            }
          }
        }

        const normalizedIsbn = normalizeIsbn(book.isbn)
        let editionId: string | null = null
        // An ISBN is unique across editions, so one owned by another work cannot be reused or re-inserted.
        let isbnOwnedByOtherWork = false

        if (normalizedIsbn) {
          const [foundEdition] = await tx
            .select({ id: editions.id, work_id: editions.work_id })
            .from(editions)
            .where(eq(editions.isbn13, normalizedIsbn))

          if (foundEdition) {
            if (foundEdition.work_id === workId) {
              editionId = foundEdition.id
            } else {
              isbnOwnedByOtherWork = true
            }
          }
        }

        // An edition is reused only by ISBN. Without an ISBN, one is created only when the file carries real edition
        // data; otherwise the reading keeps edition_id null instead of borrowing another edition of the same work.
        const hasEditionData = Boolean(book.publisher?.trim()) || (validPages ?? 0) > 0 || Boolean(validCoverUrl)

        if (!editionId && !isbnOwnedByOtherWork && (normalizedIsbn || hasEditionData)) {
          const [createdEdition] = await tx
            .insert(editions)
            .values({
              work_id: workId,
              isbn13: normalizedIsbn,
              publisher: book.publisher ?? null,
              page_count: validPages && validPages > 0 ? validPages : null,
              cover_url: validCoverUrl,
              created_by: userId,
            })
            .onConflictDoNothing()
            .returning({ id: editions.id })

          editionId = createdEdition ? createdEdition.id : null
          if (!editionId && normalizedIsbn) {
            // Second resolution: a concurrent insert may have taken this ISBN for another work.
            const [raced] = await tx
              .select({ id: editions.id, work_id: editions.work_id })
              .from(editions)
              .where(eq(editions.isbn13, normalizedIsbn))
            if (raced) {
              if (raced.work_id === workId) {
                editionId = raced.id
              } else {
                isbnOwnedByOtherWork = true
              }
            }
          }
        }

        if (isbnOwnedByOtherWork) {
          editionId = null
          itemWarnings.push(`Livro #${bookIndex} ("${book.title}"): ISBN já pertence a outra obra; leitura importada sem edição.`)
        }

        const validRate = book.rate !== null && book.rate !== undefined ? String(book.rate) : null

        await tx.insert(reading_logs).values({
          user_id: userId,
          work_id: workId,
          edition_id: editionId,
          rating: validRate,
          review: typeof book.review === 'string' ? book.review : null,
          started_on: dates.startedOn,
          finished_on: dates.finishedOn,
          finished_precision: dates.finishedPrecision,
          format: parseFormat(book.source !== undefined ? book.source : book.format),
          visibility,
          created_at: new Date(importStartMs - i),
        })

        importedCount++
      })

      errors.push(...itemWarnings)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.warn(`Falha ao importar livro #${bookIndex} (${book.title}): ${msg}`, {
        module: 'import',
        bookTitle: book.title,
        error: {
          name: err instanceof Error ? err.name : 'UnknownError',
          message: msg,
          stack: err instanceof Error ? err.stack : undefined,
        },
      })
      errors.push(formatImportError(bookIndex, book.title))
      skippedCount++
    }
  }

  logger.info(`Importação concluída: ${importedCount} importados, ${skippedCount} ignorados/erros`, {
    module: 'import',
    importedCount,
    skippedCount,
  })

  return {
    importedCount,
    skippedCount,
    errors,
  }
}
