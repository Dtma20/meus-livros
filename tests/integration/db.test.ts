import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { uniqueIsbn13 } from './fixtures'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDatabaseUrl)('Database connection and schema verification (Neon)', () => {
  let dbClient: { end: () => Promise<void> } | undefined

  let db!: typeof import('../../server/db/index').db

  beforeAll(async () => {
    const dbModule = await import('../../server/db/index')
    db = dbModule.db
    dbClient = dbModule.client
  })

  afterAll(async () => {
    if (dbClient) {
      await dbClient.end()
    }
  })

  it('runs "select 1" through db and returns 1', async () => {
    const result = await db.execute(sql`select 1 as result`)
    const firstRow = result[0]
    if (!firstRow) {
      throw new Error('Nenhuma linha retornada pelo banco de dados.')
    }
    expect(Number(firstRow.result)).toBe(1)
  })

  it('asserts all 10 application tables exist in Neon', async () => {
    const rows = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `)
    const tableNames = (rows as unknown as Array<{ table_name: string }>).map((r) => r.table_name)
    const expectedTables = [
      'allowed_emails',
      'authors',
      'editions',
      'genres',
      'reading_logs',
      'search_misses',
      'users',
      'work_authors',
      'work_genres',
      'works',
    ]
    for (const expected of expectedTables) {
      expect(tableNames).toContain(expected)
    }
  })

  it('asserts select count(*) from genres returns 26', async () => {
    const countResult = await db.execute(sql`
      SELECT count(*)::text as count FROM genres;
    `)
    expect(Number(countResult[0]?.count)).toBe(26)
  })

  it('asserts f_unaccent strips accents properly', async () => {
    const r1 = await db.execute(sql`SELECT f_unaccent('Ficção Científica') as result;`)
    expect(r1[0]?.result).toBe('Ficcao Cientifica')

    const r2 = await db.execute(sql`SELECT f_unaccent('coração') as result;`)
    expect(r2[0]?.result).toBe('coracao')

    const r3 = await db.execute(sql`SELECT f_unaccent('Ação') as result;`)
    expect(r3[0]?.result).toBe('Acao')
  })

  it('asserts works.search_text is generated automatically on insert and is not writable', async () => {
    const colInfo = await db.execute(sql`
      SELECT is_generated, generation_expression
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'works' AND column_name = 'search_text';
    `)
    expect(colInfo[0]?.is_generated).toBe('ALWAYS')

    const testWorkId = randomUUID()
    const manualWorkId = randomUUID()
    try {
      await db.execute(sql`
        INSERT INTO works (id, slug, title)
        VALUES (${testWorkId}, ${`o-hobbit-${testWorkId.slice(0, 8)}`}, 'O Hóbbït: Teste');
      `)
      const workRow = await db.execute(sql`
        SELECT search_text FROM works WHERE id = ${testWorkId};
      `)
      expect(workRow[0]?.search_text).toBe('o hobbit: teste')

      await expect(db.execute(sql`
          INSERT INTO works (id, slug, title, search_text)
          VALUES (${manualWorkId}, ${`manual-${manualWorkId.slice(0, 8)}`}, 'Manual', 'manual');
        `)).rejects.toMatchObject({ cause: { code: '428C9' } })
    } finally {
      await db.execute(sql`DELETE FROM works WHERE id IN (${testWorkId}, ${manualWorkId});`)
    }
  })

  it('asserts partial unique index editions_isbn13_key allows multiple NULLs but rejects duplicate ISBNs', async () => {
    const workId = randomUUID()
    const ed1 = randomUUID()
    const ed2 = randomUUID()
    const ed3 = randomUUID()
    const ed4 = randomUUID()
    const testIsbn = uniqueIsbn13()

    try {
      await db.execute(sql`
        INSERT INTO works (id, slug, title) VALUES (${workId}, ${`test-editions-${workId.slice(0, 8)}`}, 'Test Editions');
      `)

      await db.execute(sql`INSERT INTO editions (id, work_id, isbn13) VALUES (${ed1}, ${workId}, NULL);`)
      await db.execute(sql`INSERT INTO editions (id, work_id, isbn13) VALUES (${ed2}, ${workId}, NULL);`)

      await db.execute(sql`INSERT INTO editions (id, work_id, isbn13) VALUES (${ed3}, ${workId}, ${testIsbn});`)

      await expect(
        db.execute(sql`INSERT INTO editions (id, work_id, isbn13) VALUES (${ed4}, ${workId}, ${testIsbn});`),
      ).rejects.toMatchObject({
        cause: {
          code: '23505',
          constraint_name: 'editions_isbn13_key',
        },
      })
    } finally {
      await db.execute(sql`DELETE FROM editions WHERE work_id = ${workId};`)
      await db.execute(sql`DELETE FROM works WHERE id = ${workId};`)
    }
  })

  it('asserts rating check constraint: 3.7 is rejected and 4.5 succeeds', async () => {
    const userId = randomUUID()
    const workId = randomUUID()
    const log1 = randomUUID()
    const log2 = randomUUID()
    const userHandle = `tr_${userId.slice(0, 8)}`

    try {
      await db.execute(sql`
        INSERT INTO users (id, email, handle, display_name)
        VALUES (${userId}, ${`test-rating-${userId}@example.com`}, ${userHandle}, 'Rating User');
      `)
      await db.execute(sql`
        INSERT INTO works (id, slug, title) VALUES (${workId}, ${`test-rating-${workId.slice(0, 8)}`}, 'Rating Work');
      `)

      await expect(
        db.execute(sql`
          INSERT INTO reading_logs (id, user_id, work_id, rating)
          VALUES (${log1}, ${userId}, ${workId}, 3.7);
        `),
      ).rejects.toMatchObject({
        cause: {
          code: '23514',
          constraint_name: 'rating_half_star',
        },
      })

      await db.execute(sql`
        INSERT INTO reading_logs (id, user_id, work_id, rating)
        VALUES (${log2}, ${userId}, ${workId}, 4.5);
      `)
      const row = await db.execute(sql`
        SELECT rating FROM reading_logs WHERE id = ${log2};
      `)
      expect(Number(row[0]?.rating)).toBe(4.5)
    } finally {
      await db.execute(sql`DELETE FROM reading_logs WHERE user_id = ${userId};`)
      await db.execute(sql`DELETE FROM users WHERE id = ${userId};`)
      await db.execute(sql`DELETE FROM works WHERE id = ${workId};`)
    }
  })

  it('asserts two reading_logs with the same (user_id, work_id) both insert successfully (re-reads supported)', async () => {
    const userId = randomUUID()
    const workId = randomUUID()
    const log1 = randomUUID()
    const log2 = randomUUID()
    const userHandle = `trr_${userId.slice(0, 8)}`

    try {
      await db.execute(sql`
        INSERT INTO users (id, email, handle, display_name)
        VALUES (${userId}, ${`test-reread-${userId}@example.com`}, ${userHandle}, 'Reread User');
      `)
      await db.execute(sql`
        INSERT INTO works (id, slug, title) VALUES (${workId}, ${`test-reread-${workId.slice(0, 8)}`}, 'Reread Work');
      `)

      await db.execute(sql`
        INSERT INTO reading_logs (id, user_id, work_id, rating, finished_on, finished_precision)
        VALUES (${log1}, ${userId}, ${workId}, 4.0, '2016-01-01', 'ano');
      `)

      await db.execute(sql`
        INSERT INTO reading_logs (id, user_id, work_id, rating, finished_on, finished_precision)
        VALUES (${log2}, ${userId}, ${workId}, 5.0, '2024-01-01', 'ano');
      `)

      const logs = await db.execute(sql`
        SELECT id FROM reading_logs WHERE user_id = ${userId} AND work_id = ${workId};
      `)
      expect(logs).toHaveLength(2)
    } finally {
      await db.execute(sql`DELETE FROM reading_logs WHERE user_id = ${userId};`)
      await db.execute(sql`DELETE FROM users WHERE id = ${userId};`)
      await db.execute(sql`DELETE FROM works WHERE id = ${workId};`)
    }
  })

  it('asserts legacy/generos.txt lists exactly the 26 seeded genres', async () => {
    const content = fs.readFileSync(path.resolve(process.cwd(), 'legacy/generos.txt'), 'utf-8')
    const lines = content.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('- '))
    expect(lines).toHaveLength(26)

    const genreRows = await db.execute(sql`
      SELECT label_pt FROM genres ORDER BY id;
    `)
    expect(genreRows).toHaveLength(26)
    for (const g of genreRows as unknown as Array<{ label_pt: string }>) {
      expect(lines).toContain(`- ${g.label_pt}`)
    }
  })
})
