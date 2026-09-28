
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
import { countryCodeFor } from '../shared/constants/countries'
import { writeGenerosTxt } from './seed-genres'

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

export function brToText(html: string): string {
  const result = html
    .replace(/<br\s*\/?>\s*<br\s*\/?>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')

  if (result.includes('<')) {
    throw new Error(
      `Review still contains '<' after br conversion - possible HTML injection.\nContent: ${result.slice(0, 200)}`,
    )
  }

  return result
}

export function parseAuthors(authorStr: string): string[] {
  if (authorStr.includes(',')) {
    return authorStr.split(',').map((s) => s.trim()).filter(Boolean)
  }
  if (authorStr.includes(' e ')) {
    return authorStr.split(' e ').map((s) => s.trim()).filter(Boolean)
  }
  return [authorStr.trim()]
}

export function parseFormat(source: string): 'fisico' | 'ebook' | 'audio' {
  switch (source) {
    case 'Físico': return 'fisico'
    case 'Ebook': return 'ebook'
    default: throw new Error(`Formato desconhecido: "${source}"`)
  }
}

export function validateLivros(livros: LivroJson[]): void {
  if (livros.length !== 86) {
    throw new Error(`Esperado 86 registros, encontrado ${livros.length}.`)
  }

  for (const [i, livro] of livros.entries()) {
    const ctx = `[${i}] "${livro.title}"`

    for (const g of livro.genre) {
      if (!(g in GENRE_SLUG_MAP)) {
        throw new Error(`${ctx}: gênero desconhecido "${g}". Adicione ao GENRE_SLUG_MAP.`)
      }
    }

    if (countryCodeFor(livro.country) === null && livro.country !== 'Roma Antiga') {
      throw new Error(`${ctx}: país desconhecido "${livro.country}". Adicione a shared/constants/countries.ts.`)
    }

    const lang = livro.original_language.toLowerCase()
    if (!(lang in ISO_IDIOMA)) {
      throw new Error(`${ctx}: idioma desconhecido "${livro.original_language}". Adicione ao ISO_IDIOMA.`)
    }

    if (livro.rate !== null) {
      if (livro.rate < 0.5 || livro.rate > 5.0 || (livro.rate * 2) !== Math.trunc(livro.rate * 2)) {
        throw new Error(`${ctx}: rate inválido: ${livro.rate}`)
      }
    }
  }

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

export async function main(): Promise<void> {
  const force = process.argv.includes('--force')

  const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL_DIRECT ou DATABASE_URL não configurado.')
  }

  const ownerEmail = process.env.OWNER_EMAIL
  const ownerHandle = process.env.OWNER_HANDLE
  const ownerName = process.env.OWNER_NAME

  if (!ownerEmail || !ownerHandle || !ownerName) {
    throw new Error(
      'Variáveis OWNER_EMAIL, OWNER_HANDLE e OWNER_NAME são obrigatórias. ' +
      'Adicione-as ao .env antes de executar.',
    )
  }

  const jsonPath = path.resolve(process.cwd(), 'legacy/livros.json')
  const rawJson = fs.readFileSync(jsonPath, 'utf-8')
  const livros: LivroJson[] = JSON.parse(rawJson)

  validateLivros(livros)

  const client = postgres(connectionString, { max: 1 })
  const db = drizzle(client)

  try {
    const [logCount] = await db.select({ n: sql<number>`count(*)::int` }).from(reading_logs)
    if ((logCount?.n ?? 0) > 0 && !force) {
      throw new Error(
        `reading_logs já contém ${logCount?.n} registros. ` +
        'Use --force para sobrescrever ou verifique se a migração já foi executada.',
      )
    }

    const seededGenres = await db.select({ id: genres.id, slug: genres.slug }).from(genres)
    if (seededGenres.length === 0) {
      throw new Error('Tabela genres está vazia. Execute npm run db:seed primeiro.')
    }
    const genreSlugToId = new Map<string, number>(seededGenres.map((g) => [g.slug, g.id]))

    console.log(`Iniciando migração de ${livros.length} livros…`)

    await db.transaction(async (tx) => {
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

      if (force && (logCount?.n ?? 0) > 0) {
        console.log('Limpando dados anteriores do proprietário (--force)…')
        await tx.delete(reading_logs).where(eq(reading_logs.user_id, ownerId))
        await tx.execute(sql`DELETE FROM work_genres WHERE work_id IN (SELECT id FROM works WHERE created_by = ${ownerId})`)
        await tx.execute(sql`DELETE FROM work_authors WHERE work_id IN (SELECT id FROM works WHERE created_by = ${ownerId})`)
        await tx.delete(editions).where(eq(editions.created_by, ownerId))
        await tx.delete(works).where(eq(works.created_by, ownerId))
        await tx.delete(authors).where(eq(authors.created_by, ownerId))
      }

      await tx
        .insert(allowed_emails)
        .values({ email: ownerEmail, invited_by: null, note: 'Dono da instância' })
        .onConflictDoNothing()

      console.log(`✓ Usuário dono: ${ownerHandle} (${ownerId})`)

      let totalGenreLinks = 0
      let expectedPageSum = 0

      for (const [idx, livro] of livros.entries()) {
        const authorNames = parseAuthors(livro.author)
        const lang = ISO_IDIOMA[livro.original_language.toLowerCase()] ?? null

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

        const workResult = await createWork(
          {
            title: livro.title,
            authors: authorNames.map((name) => ({
              name,
              country_code: countryCodeFor(livro.country),
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
              published_year: null,
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

        const reviewText = livro.review ? brToText(livro.review) : null
        const format = parseFormat(livro.source)

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

    writeGenerosTxt()
    console.log('✓ legacy/generos.txt regenerado.')

    const csvPath = path.resolve(process.cwd(), 'legacy/livros_lidos_atualizado.csv')
    if (fs.existsSync(csvPath)) {
      fs.unlinkSync(csvPath)
      console.log('✓ legacy/livros_lidos_atualizado.csv removido.')
    }

    console.log('\nMigração concluída com sucesso: 86 obras, 86 edições, 86 logs.')
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
    console.error('\nMigração falhou:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
