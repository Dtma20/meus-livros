import fs from 'node:fs'
import path from 'node:path'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDatabaseUrl)('Database connection and schema verification (Neon)', () => {
  let dbClient: { end: () => Promise<void> } | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any

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
    const tableNames = rows.map((r: { table_name: string }) => r.table_name)
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

    const testWorkId = '00000000-0000-0000-0000-000000000001'
    try {
      await db.execute(sql`
        INSERT INTO works (id, slug, title)
        VALUES (${testWorkId}, 'o-hobbit-test', 'O Hóbbït: Teste');
      `)
      const workRow = await db.execute(sql`
        SELECT search_text FROM works WHERE id = ${testWorkId};
      `)
      expect(workRow[0]?.search_text).toBe('o hobbit: teste')

      // Assert writing to search_text directly fails
      await expect(
        db.execute(sql`
          INSERT INTO works (id, slug, title, search_text)
          VALUES ('00000000-0000-0000-0000-000000000002', 'manual-search-text', 'Manual', 'manual');
        `),
      ).rejects.toThrow()
    } finally {
      await db.execute(sql`DELETE FROM works WHERE id IN (${testWorkId}, '00000000-0000-0000-0000-000000000002');`)
    }
  })

  it('asserts partial unique index editions_isbn13_key allows multiple NULLs but rejects duplicate ISBNs', async () => {
    const workId = '00000000-0000-0000-0000-000000000010'
    const ed1 = '00000000-0000-0000-0000-000000000011'
    const ed2 = '00000000-0000-0000-0000-000000000012'
    const ed3 = '00000000-0000-0000-0000-000000000013'
    const ed4 = '00000000-0000-0000-0000-000000000014'
    const testIsbn = '9788535914849'

    try {
      await db.execute(sql`
        INSERT INTO works (id, slug, title) VALUES (${workId}, 'test-editions-work', 'Test Editions');
      `)
      // Two editions with isbn13 = NULL can coexist
      await db.execute(sql`INSERT INTO editions (id, work_id, isbn13) VALUES (${ed1}, ${workId}, NULL);`)
      await db.execute(sql`INSERT INTO editions (id, work_id, isbn13) VALUES (${ed2}, ${workId}, NULL);`)

      // An edition with ISBN succeeds
      await db.execute(sql`INSERT INTO editions (id, work_id, isbn13) VALUES (${ed3}, ${workId}, ${testIsbn});`)

      // A second edition with the same ISBN fails
      await expect(
        db.execute(sql`INSERT INTO editions (id, work_id, isbn13) VALUES (${ed4}, ${workId}, ${testIsbn});`),
      ).rejects.toThrow()
    } finally {
      await db.execute(sql`DELETE FROM editions WHERE work_id = ${workId};`)
      await db.execute(sql`DELETE FROM works WHERE id = ${workId};`)
    }
  })

  it('asserts rating check constraint: 3.7 is rejected and 4.5 succeeds', async () => {
    const userId = '00000000-0000-0000-0000-000000000020'
    const workId = '00000000-0000-0000-0000-000000000021'
    const log1 = '00000000-0000-0000-0000-000000000022'
    const log2 = '00000000-0000-0000-0000-000000000023'

    try {
      await db.execute(sql`
        INSERT INTO users (id, email, handle, display_name)
        VALUES (${userId}, 'test-rating@example.com', 'test_rating_user', 'Rating User');
      `)
      await db.execute(sql`
        INSERT INTO works (id, slug, title) VALUES (${workId}, 'test-rating-work', 'Rating Work');
      `)

      // Rating 3.7 raises check violation
      await expect(
        db.execute(sql`
          INSERT INTO reading_logs (id, user_id, work_id, rating)
          VALUES (${log1}, ${userId}, ${workId}, 3.7);
        `),
      ).rejects.toThrow()

      // Rating 4.5 succeeds
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
    const userId = '00000000-0000-0000-0000-000000000030'
    const workId = '00000000-0000-0000-0000-000000000031'
    const log1 = '00000000-0000-0000-0000-000000000032'
    const log2 = '00000000-0000-0000-0000-000000000033'

    try {
      await db.execute(sql`
        INSERT INTO users (id, email, handle, display_name)
        VALUES (${userId}, 'test-reread@example.com', 'test_reread_user', 'Reread User');
      `)
      await db.execute(sql`
        INSERT INTO works (id, slug, title) VALUES (${workId}, 'test-reread-work', 'Reread Work');
      `)

      // First read: 4.0 in 2016
      await db.execute(sql`
        INSERT INTO reading_logs (id, user_id, work_id, rating, finished_on, finished_precision)
        VALUES (${log1}, ${userId}, ${workId}, 4.0, '2016-01-01', 'ano');
      `)
      // Second read: 5.0 in 2024
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
    for (const g of genreRows as Array<{ label_pt: string }>) {
      expect(lines).toContain(`- ${g.label_pt}`)
    }
  })
})
