/**
 * scripts/migrate-livros.ts
 *
 * Imports 86 books from legacy/livros.json into Postgres as the owner's
 * reading history. Queries run over DATABASE_URL_DIRECT, on a client this
 * script opens itself; DATABASE_URL must still be set, because importing
 * server/db (via the catalog service) requires it.
 *
 * Usage:
 *   npx tsx scripts/migrate-livros.ts            # refuses if reading_logs non-empty
 *   npx tsx scripts/migrate-livros.ts --force    # runs cleanly even if reading_logs non-empty
 *
 * Idempotency: refuses to run if reading_logs is non-empty, unless --force.
 * When --force is passed, cleans up previous owner records in the same transaction.
 * A mid-run failure rolls back the entire transaction leaving tables empty.
 *
 * Reuses createWork from server/services/catalog.ts with skipRateLimit: true.
 *
 * The script is exempt from the ESLint rule that bars scripts/** from
 * importing `db` directly (CLAUDE.md: "scripts/** is exempt").
 */

import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { eq, sql } from 'drizzle-orm'
import {
  allowed_emails,
  authors,
  editions,
  genres,
  reading_logs,
  users,
  work_genres,
  works,
} from '../server/db/schema'
import { createWork } from '../server/services/catalog'
import { normalizeIsbn } from '../server/utils/isbn'
import { writeGenerosTxt } from './seed-genres'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LivroJson {
  title: string
  author: string
  country: string
  original_language: string
  year: number
  publisher: string
  pages: number
  read_in: number
  rate: number | null
  review: string | null
  source: string
  series_name?: string | null
  series_number?: string | null
  genre: string[]
  isbn: string
  cover_url: string | null
}

// ---------------------------------------------------------------------------
// Mapping tables — every value from §4 and §5 of migration.md
// ---------------------------------------------------------------------------

export const ISO_PAIS: Record<string, string | null> = {
  'Reino Unido': 'GB',
  'EUA': 'US',
  'Brasil': 'BR',
  'Alemanha': 'DE',
  'Rússia': 'RU',
  'França': 'FR',
  'Portugal': 'PT',
  'China': 'CN',
  'Israel': 'IL',
  'Áustria': 'AT',
  'Noruega': 'NO',
  'Colômbia': 'CO',
  'Japão': 'JP',
  'Roma Antiga': null,
}

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

/**
 * Maps the 26 data labels to genre slugs (seeded in genres table).
 * Biografia and Autobiografia both map to 'biografia' — deliberate merge.
 */
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
  'Desenvolvimento Pessoal': 'desenvolvimento-pessoal',
  'Fábula': 'fabula',
  'Graphic Novel': 'graphic-novel',
  'Matemática': 'matematica',
  'Ciência': 'ciencia',
  'Economia': 'economia',
  'Ensaio': 'ensaio',
  'Tecnologia': 'tecnologia',
  'Teatro': 'dramaturgia',
  'Comédia': 'comedia',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert HTML <br> tags to plain-text newlines.
 * <br><br> → \n\n, <br> → \n
 * Then asserts no '<' remains — that assertion is the security control
 * that makes "reviews are plain text" true rather than assumed.
 */
export function brToText(html: string): string {
  const result = html
    .replace(/<br\s*\/?>\s*<br\s*\/?>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')

  if (result.includes('<')) {
    throw new Error(
      `Review still contains '<' after br conversion — possible HTML injection.\nContent: ${result.slice(0, 200)}`,
    )
  }

  return result
}

/**
 * Parse authors from a book's `author` field.
 * A comma or ' e ' separates multiple authors.
 * Returns an array of names (trimmed, in order).
 */
export function parseAuthors(authorStr: string): string[] {
  if (authorStr.includes(',')) {
    return authorStr.split(',').map((s) => s.trim()).filter(Boolean)
  }
  if (authorStr.includes(' e ')) {
    return authorStr.split(' e ').map((s) => s.trim()).filter(Boolean)
  }
  return [authorStr.trim()]
}

/**
 * Map `source` field to the book_format enum.
 * 'Físico' → 'fisico', 'Ebook' → 'ebook'
 */
export function parseFormat(source: string): 'fisico' | 'ebook' | 'audio' {
  switch (source) {
    case 'Físico': return 'fisico'
    case 'Ebook': return 'ebook'
    default: throw new Error(`Formato desconhecido: "${source}"`)
  }
}

// ---------------------------------------------------------------------------
// Pre-flight validation
// ---------------------------------------------------------------------------

export function validateLivros(livros: LivroJson[]): void {
  if (livros.length !== 86) {
    throw new Error(`Esperado 86 registros, encontrado ${livros.length}.`)
  }

  for (const [i, livro] of livros.entries()) {
    const ctx = `[${i}] "${livro.title}"`

    // Genre labels
    for (const g of livro.genre) {
      if (!(g in GENRE_SLUG_MAP)) {
        throw new Error(`${ctx}: gênero desconhecido "${g}". Adicione ao GENRE_SLUG_MAP.`)
      }
    }

    // Country
    if (!(livro.country in ISO_PAIS)) {
      throw new Error(`${ctx}: país desconhecido "${livro.country}". Adicione ao ISO_PAIS.`)
    }

    // Language (case-folded)
    const lang = livro.original_language.toLowerCase()
    if (!(lang in ISO_IDIOMA)) {
      throw new Error(`${ctx}: idioma desconhecido "${livro.original_language}". Adicione ao ISO_IDIOMA.`)
    }

    // Rating
    if (livro.rate !== null) {
      if (livro.rate < 0.5 || livro.rate > 5.0 || (livro.rate * 2) !== Math.trunc(livro.rate * 2)) {
        throw new Error(`${ctx}: rate inválido: ${livro.rate}`)
      }
    }
  }

  // All ISBNs must normalise; verify 83 distinct valid ISBNs and 3 null ISBNs (ASINs)
  const isbn13Set = new Set<string>()
  let validIsbnCount = 0
  let nullIsbnCount = 0

  for (const [i, livro] of livros.entries()) {
    const isbn13 = normalizeIsbn(livro.isbn)
    if (isbn13 !== null) {
      if (isbn13Set.has(isbn13)) {
        throw new Error(`[${i}] "${livro.title}": ISBN-13 ${isbn13} duplicado.`)
      }
      isbn13Set.add(isbn13)
      validIsbnCount++
    } else {
      nullIsbnCount++
    }
  }

  if (validIsbnCount !== 83 || nullIsbnCount !== 3) {
    throw new Error(
      `Esperado 83 ISBNs válidos e 3 nulos (ASINs). Obtido: ${validIsbnCount} válidos, ${nullIsbnCount} nulos.`,
    )
  }

  console.log('✓ Pre-flight validations passed (86 records, 83 valid ISBNs, 3 null ASINs).')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function main(): Promise<void> {
  const force = process.argv.includes('--force')

  const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL_DIRECT ou DATABASE_URL não configurado.')
  }

  // Owner identity — never hardcoded
  const ownerEmail = process.env.OWNER_EMAIL
  const ownerHandle = process.env.OWNER_HANDLE
  const ownerName = process.env.OWNER_NAME

  if (!ownerEmail || !ownerHandle || !ownerName) {
    throw new Error(
      'Variáveis OWNER_EMAIL, OWNER_HANDLE e OWNER_NAME são obrigatórias. ' +
      'Adicione-as ao .env antes de executar.',
    )
  }

  // Load JSON
  const jsonPath = path.resolve(process.cwd(), 'legacy/livros.json')
  const rawJson = fs.readFileSync(jsonPath, 'utf-8')
  const livros: LivroJson[] = JSON.parse(rawJson)

  // Pre-flight
  validateLivros(livros)

  const client = postgres(connectionString, { max: 1 })
  const db = drizzle(client)

  try {
    // Idempotency guard
    const [logCount] = await db.select({ n: sql<number>`count(*)::int` }).from(reading_logs)
    if ((logCount?.n ?? 0) > 0 && !force) {
      throw new Error(
        `reading_logs já contém ${logCount?.n} registros. ` +
        'Use --force para sobrescrever ou verifique se a migração já foi executada.',
      )
    }

    // Load seeded genres → slug→id map
    const seededGenres = await db.select({ id: genres.id, slug: genres.slug }).from(genres)
    if (seededGenres.length === 0) {
      throw new Error('Tabela genres está vazia. Execute npm run db:seed primeiro.')
    }
    const genreSlugToId = new Map<string, number>(seededGenres.map((g) => [g.slug, g.id]))

    console.log(`Iniciando migração de ${livros.length} livros…`)

    await db.transaction(async (tx) => {
      // -----------------------------------------------------------------------
      // 1. Insert owner into users and allowed_emails
      // -----------------------------------------------------------------------
      const [owner] = await tx
        .insert(users)
        .values({
          email: ownerEmail,
          handle: ownerHandle,
          display_name: ownerName,
          profile_visibility: 'publico',
        })
        .onConflictDoNothing()
        .returning({ id: users.id })

      let ownerId: string
      if (owner) {
        ownerId = owner.id
      } else {
        const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, ownerEmail))
        if (!existing) throw new Error('Não foi possível criar ou encontrar o usuário dono.')
        ownerId = existing.id
      }

      // If --force is set and reading_logs was not empty, wipe previous owner data cleanly
      if (force && (logCount?.n ?? 0) > 0) {
        console.log('Limpando dados anteriores do proprietário (--force)…')
        await tx.delete(reading_logs).where(eq(reading_logs.user_id, ownerId))
        await tx.execute(sql`DELETE FROM work_genres WHERE work_id IN (SELECT id FROM works WHERE created_by = ${ownerId})`)
        await tx.execute(sql`DELETE FROM work_authors WHERE work_id IN (SELECT id FROM works WHERE created_by = ${ownerId})`)
        await tx.delete(editions).where(eq(editions.created_by, ownerId))
        await tx.delete(works).where(eq(works.created_by, ownerId))
        await tx.delete(authors).where(eq(authors.created_by, ownerId))
      }

      // Insert into allowed_emails so owner can sign in via normal OTP flow
      await tx
        .insert(allowed_emails)
        .values({ email: ownerEmail, invited_by: null, note: 'Dono da instância' })
        .onConflictDoNothing()

      console.log(`✓ Usuário dono: ${ownerHandle} (${ownerId})`)

      // -----------------------------------------------------------------------
      // 2–8. Process each book via catalog.createWork
      // -----------------------------------------------------------------------
      let totalGenreLinks = 0
      let expectedPageSum = 0

      for (const [idx, livro] of livros.entries()) {
        const authorNames = parseAuthors(livro.author)
        const lang = ISO_IDIOMA[livro.original_language.toLowerCase()] ?? null

        // Map genre IDs
        const genreIdSet = new Set<number>()
        for (const genreLabel of livro.genre) {
          const genreSlug = GENRE_SLUG_MAP[genreLabel]!
          const genreId = genreSlugToId.get(genreSlug)
          if (genreId === undefined) {
            throw new Error(`Gênero "${genreLabel}" → slug "${genreSlug}" não encontrado na tabela genres.`)
          }
          genreIdSet.add(genreId)
        }
        totalGenreLinks += genreIdSet.size

        // Exercise the production createWork path
        const workResult = await createWork(
          {
            title: livro.title,
            authors: authorNames.map((name) => ({
              name,
              country_code: ISO_PAIS[livro.country] ?? null,
              country_label: livro.country,
            })),
            original_language: lang,
            first_published_year: livro.year,
            series_name: livro.series_name ?? null,
            series_number: livro.series_number ?? null,
            ol_work_key: null,
            genre_ids: [...genreIdSet],
            edition: {
              isbn: livro.isbn,
              publisher: livro.publisher,
              page_count: livro.pages,
              published_year: null, // Deliberately null per migration.md §4
              language: 'pt',
              cover_url: livro.cover_url ?? null,
              ol_cover_id: null,
            },
          },
          ownerId,
          {
            force: true,
            skipRateLimit: true,
            tx,
          },
        )

        expectedPageSum += livro.pages

        if (!workResult.edition?.id) {
          throw new Error(`Edição não criada para a obra "${livro.title}".`)
        }

        // ------------------------------------------------------------------
        // 8. reading_logs
        // ------------------------------------------------------------------
        const reviewText = livro.review ? brToText(livro.review) : null
        const format = parseFormat(livro.source)

        // Preserve reading order: created_at = make_date(read_in,1,1) + idx minutes
        // finished_on = make_date(read_in, 1, 1)
        const finishedOn = `${livro.read_in}-01-01`
        const baseDate = new Date(`${livro.read_in}-01-01T00:00:00Z`)
        const createdAt = new Date(baseDate.getTime() + idx * 60 * 1000)

        await tx
          .insert(reading_logs)
          .values({
            user_id: ownerId,
            work_id: workResult.id,
            edition_id: workResult.edition.id,
            rating: livro.rate !== null ? String(livro.rate) : null,
            review: reviewText,
            started_on: null,
            finished_on: finishedOn,
            finished_precision: 'ano',
            format,
            visibility: 'publico',
            created_at: createdAt,
            updated_at: createdAt,
          })

        if ((idx + 1) % 10 === 0 || idx + 1 === livros.length) {
          console.log(`  [${idx + 1}/${livros.length}] livros processados…`)
        }
      }

      // -----------------------------------------------------------------------
      // Post-insert assertions (same transaction)
      // -----------------------------------------------------------------------
      console.log('Executando validações pós-insert…')

      const [wCount] = await tx.select({ n: sql<number>`count(*)::int` }).from(works).where(eq(works.created_by, ownerId))
      const [eCount] = await tx.select({ n: sql<number>`count(*)::int` }).from(editions).where(eq(editions.created_by, ownerId))
      const [lCount] = await tx.select({ n: sql<number>`count(*)::int` }).from(reading_logs).where(eq(reading_logs.user_id, ownerId))
      const [reviewCount] = await tx.select({ n: sql<number>`count(*)::int` }).from(reading_logs).where(sql`${reading_logs.review} IS NOT NULL AND ${reading_logs.user_id} = ${ownerId}`)
      const [ratingCount] = await tx.select({ n: sql<number>`count(*)::int` }).from(reading_logs).where(sql`${reading_logs.rating} IS NOT NULL AND ${reading_logs.user_id} = ${ownerId}`)
      const [htmlCheck] = await tx.select({ n: sql<number>`count(*)::int` }).from(reading_logs).where(sql`${reading_logs.review} LIKE '%<%' AND ${reading_logs.user_id} = ${ownerId}`)
      const [minYear] = await tx.select({ y: sql<number>`min(${works.first_published_year})` }).from(works).where(eq(works.created_by, ownerId))
      const [pageSum] = await tx.select({ s: sql<number>`sum(${editions.page_count})::int` }).from(editions).where(eq(editions.created_by, ownerId))
      const [editionCheck] = await tx.select({ n: sql<number>`count(*)::int` }).from(reading_logs).where(sql`${reading_logs.edition_id} IS NULL AND ${reading_logs.user_id} = ${ownerId}`)
      const [mismatchCheck] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(reading_logs)
        .innerJoin(editions, eq(editions.id, reading_logs.edition_id!))
        .where(sql`${editions.work_id} != ${reading_logs.work_id} AND ${reading_logs.user_id} = ${ownerId}`)
      const [wgCount] = await tx.select({ n: sql<number>`count(*)::int` }).from(work_genres).where(sql`${work_genres.work_id} IN (SELECT id FROM works WHERE created_by = ${ownerId})`)

      const assertions: Array<[string, unknown, unknown]> = [
        ['works count', wCount?.n, 86],
        ['editions count', eCount?.n, 86],
        ['reading_logs count', lCount?.n, 86],
        ['reviews not null', reviewCount?.n, 56],
        ['ratings not null', ratingCount?.n, 85],
        ['reviews with HTML', htmlCheck?.n, 0],
        ['min first_published_year', minYear?.y, -500],
        ['page sum', pageSum?.s, expectedPageSum],
        ['logs with null edition_id', editionCheck?.n, 0],
        ['logs with mismatched edition_id', mismatchCheck?.n, 0],
        ['work_genres count', wgCount?.n, totalGenreLinks],
      ]

      const failures: string[] = []
      for (const [label, actual, expected] of assertions) {
        if (actual !== expected) {
          failures.push(`  ${label}: esperado ${expected}, obtido ${actual}`)
        }
      }

      // Author count assertion:
      // 59 raw author strings, 2 multi-author records ('Pierre Weil, Roland Tompakow' and 'Karl Marx, Friedrich Engels').
      // Friedrich Engels is also single author of 'Do socialismo utópico ao socialismo científico',
      // so the split yields exactly 60 unique authors. Measured against the real
      // corpus — asserted exactly, not as a range.
      const [aCount] = await tx.select({ n: sql<number>`count(*)::int` }).from(authors).where(eq(authors.created_by, ownerId))
      if (aCount?.n !== 60) {
        failures.push(`  authors count: esperado 60, obtido ${aCount?.n}`)
      }

      if (failures.length > 0) {
        throw new Error(`Validações pós-insert falharam:\n${failures.join('\n')}`)
      }

      console.log(`✓ works = ${wCount?.n}`)
      console.log(`✓ editions = ${eCount?.n}`)
      console.log(`✓ reading_logs = ${lCount?.n}`)
      console.log(`✓ authors = ${aCount?.n}`)
      console.log(`✓ reviews com conteúdo = ${reviewCount?.n}`)
      console.log(`✓ ratings preenchidos = ${ratingCount?.n}`)
      console.log(`✓ reviews sem HTML = ${htmlCheck?.n === 0 ? 'OK' : 'FALHOU'}`)
      console.log(`✓ min first_published_year = ${minYear?.y}`)
      console.log(`✓ soma de páginas = ${pageSum?.s}`)
      console.log(`✓ work_genres = ${wgCount?.n}`)
    })

    // -----------------------------------------------------------------------
    // Post-commit housekeeping (not part of transaction)
    // -----------------------------------------------------------------------

    // Regenerate legacy/generos.txt from seeded genres
    writeGenerosTxt()
    console.log('✓ legacy/generos.txt regenerado.')

    // Delete legacy/livros_lidos_atualizado.csv
    const csvPath = path.resolve(process.cwd(), 'legacy/livros_lidos_atualizado.csv')
    if (fs.existsSync(csvPath)) {
      fs.unlinkSync(csvPath)
      console.log('✓ legacy/livros_lidos_atualizado.csv removido.')
    }

    console.log('\n✅ Migração concluída com sucesso: 86 obras, 86 edições, 86 logs.')
  } finally {
    await client.end()
  }
}

const isDirectExecution = process.argv[1] && (
  process.argv[1].endsWith('migrate-livros.ts') ||
  process.argv[1].endsWith('migrate-livros.js')
)

if (isDirectExecution) {
  main().catch((err: unknown) => {
    console.error('\n❌ Migração falhou:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
