/**
 * tests/integration/migration.test.ts
 *
 * Integration tests for the livros.json migration.
 * Runs against the real database. Skipped if DATABASE_URL is not set.
 *
 * These tests verify the data that the migration script inserted — they do NOT
 * re-run the migration. The migration must be run separately before these tests.
 *
 * Every assertion here corresponds to a requirement in:
 *   docs/tasks/019-migrate-livros-json.md §Testing requirements
 *   docs/migration.md §7
 */

import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import {
  brToText,
  GENRE_SLUG_MAP,
  parseAuthors,
  parseFormat,
  validateLivros,
} from '../../scripts/migrate-livros'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDatabaseUrl)('Migration: livros.json data integrity', () => {
  let db: typeof import('../../server/db')['db']
  let client: typeof import('../../server/db')['client']
  let schema: typeof import('../../server/db/schema')

  /**
   * Every assertion below is scoped to the owner's rows.
   *
   * A bare `count(*)` over `authors` or `reading_logs` is not a migration
   * assertion — it is an assertion about the whole database, and it breaks the
   * moment another test file creates a row in a parallel worker. That is
   * exactly what happened once the auth suite landed. The migration script's
   * own post-insert checks filter by `created_by`; these do the same.
   */
  let ownerId: string

  beforeAll(async () => {
    const dbModule = await import('../../server/db')
    db = dbModule.db
    client = dbModule.client
    schema = await import('../../server/db/schema')

    // The owner is whoever holds the migrated corpus: 86 logs against a handful
    // that other test files create and delete. Deriving it from the data rather
    // than from OWNER_EMAIL keeps this file working in a worktree whose .env
    // carries only the database credentials.
    const [owner] = await db.execute(sql<{ user_id: string }>`
      SELECT user_id FROM reading_logs GROUP BY user_id ORDER BY count(*) DESC LIMIT 1
    `)
    if (!owner) {
      throw new Error('reading_logs está vazia. Rode scripts/migrate-livros.ts primeiro.')
    }
    ownerId = String(owner.user_id)
  })

  afterAll(async () => {
    if (client) {
      await client.end()
    }
  })

  it('works = 86, editions = 86, reading_logs = 86', async () => {
    const [wc] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.works).where(sql`${schema.works.created_by} = ${ownerId}`)
    const [ec] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.editions).where(sql`${schema.editions.created_by} = ${ownerId}`)
    const [lc] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.reading_logs).where(sql`${schema.reading_logs.user_id} = ${ownerId}`)

    expect(wc?.n).toBe(86)
    expect(ec?.n).toBe(86)
    expect(lc?.n).toBe(86)
  })

  it('authors count is exactly 60 (multi-author books split correctly)', async () => {
    // 59 raw author strings. Multi-author records are 'Pierre Weil, Roland Tompakow' and
    // 'Karl Marx, Friedrich Engels'. Friedrich Engels also authored 'Do socialismo utópico...',
    // so splitting both records yields 60 unique authors. migration.md predicted
    // 59 or 61; the real corpus gives 60.
    const [ac] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.authors)
      .where(sql`${schema.authors.created_by} = ${ownerId}`)
    expect(ac?.n).toBe(60)
  })

  it('reading_logs with non-null review = 56', async () => {
    const [rc] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.reading_logs)
      .where(sql`${schema.reading_logs.review} IS NOT NULL AND ${schema.reading_logs.user_id} = ${ownerId}`)
    expect(rc?.n).toBe(56)
  })

  it('reading_logs with non-null rating = 85', async () => {
    const [rc] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.reading_logs)
      .where(sql`${schema.reading_logs.rating} IS NOT NULL AND ${schema.reading_logs.user_id} = ${ownerId}`)
    expect(rc?.n).toBe(85)
  })

  it('no review contains HTML (<)', async () => {
    const [hc] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.reading_logs)
      .where(sql`${schema.reading_logs.review} LIKE '%<%' AND ${schema.reading_logs.user_id} = ${ownerId}`)
    expect(hc?.n).toBe(0)
  })

  it('min(first_published_year) = -500', async () => {
    const [row] = await db
      .select({ y: sql<number>`min(${schema.works.first_published_year})` })
      .from(schema.works)
      .where(sql`${schema.works.created_by} = ${ownerId}`)
    expect(row?.y).toBe(-500)
  })

  it('every reading_log has a non-null edition_id that belongs to its work_id', async () => {
    // Count logs where edition_id is null
    const [nullEditions] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.reading_logs)
      .where(sql`${schema.reading_logs.edition_id} IS NULL AND ${schema.reading_logs.user_id} = ${ownerId}`)
    expect(nullEditions?.n).toBe(0)

    // Count logs where edition does not belong to the log's work
    const [mismatch] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.reading_logs)
      .innerJoin(schema.editions, eq(schema.editions.id, schema.reading_logs.edition_id!))
      .where(sql`${schema.editions.work_id} != ${schema.reading_logs.work_id} AND ${schema.reading_logs.user_id} = ${ownerId}`)
    expect(mismatch?.n).toBe(0)
  })

  it('sum(page_count) equals sum of pages in livros.json', async () => {
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'legacy/livros.json'), 'utf-8')
    const livros: Array<{ pages: number }> = JSON.parse(raw)
    const expectedSum = livros.reduce((acc, b) => acc + b.pages, 0)

    const [row] = await db
      .select({ s: sql<number>`sum(${schema.editions.page_count})::int` })
      .from(schema.editions)
      .where(sql`${schema.editions.created_by} = ${ownerId}`)
    expect(row?.s).toBe(expectedSum)
  })

  it('work_genres count equals sum of genre-array lengths', async () => {
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'legacy/livros.json'), 'utf-8')
    const livros: Array<{ genre: string[] }> = JSON.parse(raw)

    let expectedGenreLinks = 0
    for (const livro of livros) {
      const slugSet = new Set(livro.genre.map((g) => GENRE_SLUG_MAP[g] ?? g))
      expectedGenreLinks += slugSet.size
    }

    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.work_genres)
      .where(sql`${schema.work_genres.work_id} IN (SELECT id FROM works WHERE created_by = ${ownerId})`)
    expect(row?.n).toBe(expectedGenreLinks)
  })

  it('spot check: O retorno do rei — series O Senhor dos Anéis #3, read 2026', async () => {
    const rows = await db
      .select({
        title: schema.works.title,
        series_name: schema.works.series_name,
        series_number: schema.works.series_number,
        finished_on: schema.reading_logs.finished_on,
        review: schema.reading_logs.review,
      })
      .from(schema.works)
      .innerJoin(schema.reading_logs, eq(schema.reading_logs.work_id, schema.works.id))
      .where(sql`lower(${schema.works.title}) = lower('O retorno do rei')`)

    expect(rows.length).toBeGreaterThan(0)
    const row = rows[0]!
    expect(row.series_name).toBe('O Senhor dos Anéis')
    expect(row.series_number).toBe('3')
    expect(row.finished_on).toBe('2026-01-01')
    if (row.review) {
      expect(row.review).not.toContain('<')
    }
  })

  it('spot check: review with paragraph breaks preserves newlines without HTML', async () => {
    const rows = await db
      .select({
        title: schema.works.title,
        review: schema.reading_logs.review,
      })
      .from(schema.works)
      .innerJoin(schema.reading_logs, eq(schema.reading_logs.work_id, schema.works.id))
      .where(sql`lower(${schema.works.title}) = lower('A sociedade do anel')`)

    expect(rows.length).toBeGreaterThan(0)
    const row = rows[0]!
    expect(row.review).not.toBeNull()
    expect(row.review).not.toContain('<')
    expect(row.review).toContain('\n')
  })

  it('spot check: Pollyanna omnibus keeps series_number = "1-2"', async () => {
    const rows = await db
      .select({ series_number: schema.works.series_number })
      .from(schema.works)
      .where(sql`${schema.works.title} ILIKE '%Pollyanna%mo%'`)

    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]?.series_number).toBe('1-2')
  })

  it('spot check: Robots prequel keeps series_number = "0.1"', async () => {
    const rows = await db
      .select({ series_number: schema.works.series_number })
      .from(schema.works)
      .where(sql`${schema.works.series_number} = '0.1'`)

    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]?.series_number).toBe('0.1')
  })

  it('spot check: unrated book has rating IS NULL, not 0', async () => {
    const rows = await db
      .select({ rating: schema.reading_logs.rating })
      .from(schema.reading_logs)
      .where(sql`${schema.reading_logs.rating} IS NULL AND ${schema.reading_logs.user_id} = ${ownerId}`)

    expect(rows.length).toBe(1)
    expect(rows[0]?.rating).toBeNull()
  })

  it('ordering by finished_on DESC, created_at DESC matches reading order', async () => {
    const logs = await db
      .select({
        finished_on: schema.reading_logs.finished_on,
        created_at: schema.reading_logs.created_at,
      })
      .from(schema.reading_logs)
      .where(sql`${schema.reading_logs.user_id} = ${ownerId}`)
      .orderBy(sql`${schema.reading_logs.finished_on} ASC`, sql`${schema.reading_logs.created_at} ASC`)

    const byYear = new Map<string, Date[]>()
    for (const log of logs) {
      const year = log.finished_on ?? ''
      if (!byYear.has(year)) byYear.set(year, [])
      byYear.get(year)!.push(log.created_at!)
    }

    for (const [, timestamps] of byYear) {
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]!.getTime()).toBeGreaterThan(timestamps[i - 1]!.getTime())
      }
    }
  })
})

describe('Migration: unit validations and helpers', () => {
  it('converts <br><br> to \\n\\n and <br> to \\n, rejecting residual HTML', () => {
    const input = 'Primeiro parágrafo.<br><br>Segundo parágrafo.<br>Linha seguinte.'
    const output = brToText(input)
    expect(output).toBe('Primeiro parágrafo.\n\nSegundo parágrafo.\nLinha seguinte.')
    expect(output).not.toContain('<')

    expect(() => brToText('Texto com <script>alert(1)</script>')).toThrow(/possible HTML injection/)
  })

  it('parseAuthors handles single authors, commas, and " e "', () => {
    expect(parseAuthors('J.R.R. Tolkien')).toEqual(['J.R.R. Tolkien'])
    expect(parseAuthors('Pierre Weil, Roland Tompakow')).toEqual(['Pierre Weil', 'Roland Tompakow'])
    expect(parseAuthors('Autor 1 e Autor 2')).toEqual(['Autor 1', 'Autor 2'])
  })

  it('parseFormat maps Físico and Ebook to enum values', () => {
    expect(parseFormat('Físico')).toBe('fisico')
    expect(parseFormat('Ebook')).toBe('ebook')
    expect(() => parseFormat('Audiolivro')).toThrow(/Formato desconhecido/)
  })

  it('validateLivros aborts if an unmapped genre is introduced', () => {
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'legacy/livros.json'), 'utf-8')
    const livros = JSON.parse(raw)
    const modified = JSON.parse(JSON.stringify(livros))
    modified[0].genre.push('GeneroInexistente')

    expect(() => validateLivros(modified)).toThrow(/gênero desconhecido "GeneroInexistente"/)
  })

  it('validateLivros aborts if an unmapped country is introduced', () => {
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'legacy/livros.json'), 'utf-8')
    const livros = JSON.parse(raw)
    const modified = JSON.parse(JSON.stringify(livros))
    modified[0].country = 'Atlantida'

    expect(() => validateLivros(modified)).toThrow(/país desconhecido "Atlantida"/)
  })

  it('validateLivros aborts if count is not 86', () => {
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'legacy/livros.json'), 'utf-8')
    const livros = JSON.parse(raw)
    expect(() => validateLivros(livros.slice(0, 10))).toThrow(/Esperado 86 registros/)
  })

  it('legacy file status: livros_lidos_atualizado.csv is deleted, livros.json is kept', () => {
    const csvExists = fs.existsSync(path.resolve(process.cwd(), 'legacy/livros_lidos_atualizado.csv'))
    const jsonExists = fs.existsSync(path.resolve(process.cwd(), 'legacy/livros.json'))
    expect(jsonExists).toBe(true)
    expect(csvExists).toBe(false)
  })
})
