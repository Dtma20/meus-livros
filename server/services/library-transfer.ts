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
import type { LivroJson, ImportResult } from '../../shared/schemas/export-import'

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
  'Sociologia': 'sociologia',
  'Psicologia': 'psicologia',
  'Divulgação Científica': 'divulgacao-cientifica',
  'Ensaio': 'ensaio',
  'Crônica': 'cronica',
  'Poesia': 'poesia',
  'Teatro': 'teatro',
  'Religião': 'religiao',
  'HQ': 'hq',
  'Mangá': 'manga',
}

export function parseAuthors(raw: string): string[] {
  if (!raw || !raw.trim()) return []
  return raw
    .split(/,| e |;|\//g)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function parseFormat(source?: string | null): 'fisico' | 'ebook' | 'audio' {
  if (!source) return 'fisico'
  const lower = source.toLowerCase()
  if (lower.includes('kindle') || lower.includes('ebook') || lower.includes('e-book') || lower.includes('digital')) {
    return 'ebook'
  }
  if (lower.includes('audio') || lower.includes('áudio')) {
    return 'audio'
  }
  return 'fisico'
}

export function formatSourceLabel(format?: string | null): string {
  if (format === 'ebook') return 'Kindle'
  if (format === 'audio') return 'Audiobook'
  return 'Físico'
}

export function formatImportError(bookIndex: number, title: string): string {
  return `Livro #${bookIndex} ("${title}"): não foi possível importar.`
}

/**
 * Exporta toda a biblioteca de leituras de um usuário no formato JSON.
 */
export async function exportUserLibrary(userId: string): Promise<LivroJson[]> {
  logger.info(`Exportando biblioteca do usuário ${userId}`, { module: 'export', userId })

  const logs = await db
    .select({
      id: reading_logs.id,
      rating: reading_logs.rating,
      review: reading_logs.review,
      finished_on: reading_logs.finished_on,
      finished_precision: reading_logs.finished_precision,
      format: reading_logs.format,
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

  // Buscar autores agrupados por work_id
  const authorRows = await db
    .select({
      work_id: work_authors.work_id,
      name: authors.name,
      country_label: authors.country_label,
    })
    .from(work_authors)
    .innerJoin(authors, eq(authors.id, work_authors.author_id))
    .where(inArray(work_authors.work_id, workIds))
    .orderBy(work_authors.position)

  const authorsByWork = new Map<string, Array<{ name: string; country: string | null }>>()
  for (const a of authorRows) {
    let list = authorsByWork.get(a.work_id)
    if (!list) {
      list = []
      authorsByWork.set(a.work_id, list)
    }
    list.push({ name: a.name, country: a.country_label })
  }

  // Buscar gêneros agrupados por work_id
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
    const lang = log.original_language ? (IDIOMA_ISO_REVERSE[log.original_language] ?? log.original_language) : null

    let readIn: number | string | null = null
    if (log.finished_on) {
      if (log.finished_precision === 'ano') {
        readIn = parseInt(log.finished_on.split('-')[0] ?? '', 10) || null
      } else {
        readIn = log.finished_on
      }
    }

    return {
      title: log.title,
      author: authorStr,
      country,
      original_language: lang,
      year: log.first_published_year,
      publisher: log.publisher ?? null,
      pages: log.page_count ?? null,
      read_in: readIn,
      rate: log.rating ? Number(log.rating) : null,
      review: log.review,
      source: formatSourceLabel(log.format),
      series_name: log.series_name,
      series_number: log.series_number,
      genre: genresByWork.get(log.work_id) ?? [],
      isbn: log.isbn13 ?? null,
      cover_url: log.cover_url,
    }
  })
}

/**
 * Importa um lote de livros para a biblioteca do usuário a partir de um JSON.
 */
export async function importUserLibrary(userId: string, books: LivroJson[]): Promise<ImportResult> {
  logger.info(`Iniciando importação de ${books.length} livros para o usuário ${userId}`, {
    module: 'import',
    userId,
    count: books.length,
  })

  // Carregar todos os gêneros do banco para consulta em memória
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

  for (let i = 0; i < books.length; i++) {
    const book = books[i]!
    const bookIndex = i + 1

    try {
      await db.transaction(async (tx) => {
        // 1. Processar autores
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
            const [newAuthor] = await tx
              .insert(authors)
              .values({
                name: aName,
                slug: aSlug,
                country_label: book.country ?? null,
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

        // 2. Localizar ou criar Obra (Work)
        const baseSlug = slugify(book.title) || 'obra'
        let workId: string | null = null

        // Tentar encontrar obra existente com o mesmo título e autor
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
          // Gerar slug único
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
              first_published_year: book.year ?? null,
              series_name: book.series_name ?? null,
              series_number: book.series_number ?? null,
              created_by: userId,
            })
            .returning({ id: works.id })

          workId = createdWork!.id

          // Vincular autores
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

          // Vincular gêneros
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
              }
            }
          }
        }

        // 3. Processar Edição (Edition)
        const normalizedIsbn = normalizeIsbn(book.isbn)
        let editionId: string | null = null

        if (normalizedIsbn) {
          const [foundEdition] = await tx
            .select({ id: editions.id })
            .from(editions)
            .where(eq(editions.isbn13, normalizedIsbn))

          if (foundEdition) {
            editionId = foundEdition.id
          }
        }

        if (!editionId) {
          // Buscar primeira edição da obra ou criar
          const [existingForWork] = await tx
            .select({ id: editions.id })
            .from(editions)
            .where(eq(editions.work_id, workId))
            .limit(1)

          if (existingForWork && !normalizedIsbn) {
            editionId = existingForWork.id
          } else {
            const [createdEdition] = await tx
              .insert(editions)
              .values({
                work_id: workId,
                isbn13: normalizedIsbn,
                publisher: book.publisher ?? null,
                page_count: book.pages && book.pages > 0 ? book.pages : null,
                cover_url: book.cover_url ?? null,
                created_by: userId,
              })
              .onConflictDoNothing()
              .returning({ id: editions.id })

            editionId = createdEdition ? createdEdition.id : null
            if (!editionId && normalizedIsbn) {
              const [raced] = await tx
                .select({ id: editions.id })
                .from(editions)
                .where(eq(editions.isbn13, normalizedIsbn))
              if (raced) editionId = raced.id
            }
          }
        }

        // 4. Inserir Registro de Leitura (reading_logs)
        let finishedOn: string | null = null
        let finishedPrecision: 'dia' | 'mes' | 'ano' = 'ano'

        if (book.read_in) {
          if (typeof book.read_in === 'number') {
            finishedOn = `${book.read_in}-01-01`
            finishedPrecision = 'ano'
          } else {
            const trimmed = book.read_in.trim()
            if (/^\d{4}$/.test(trimmed)) {
              finishedOn = `${trimmed}-01-01`
              finishedPrecision = 'ano'
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
              finishedOn = trimmed
              finishedPrecision = 'dia'
            } else {
              finishedOn = `${new Date().getFullYear()}-01-01`
              finishedPrecision = 'ano'
            }
          }
        }

        const validRate = book.rate !== null && book.rate !== undefined ? String(book.rate) : null

        await tx.insert(reading_logs).values({
          user_id: userId,
          work_id: workId,
          edition_id: editionId,
          rating: validRate,
          review: book.review ?? null,
          finished_on: finishedOn,
          finished_precision: finishedPrecision,
          format: parseFormat(book.source),
          visibility: 'publico',
        })

        importedCount++
      })
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
