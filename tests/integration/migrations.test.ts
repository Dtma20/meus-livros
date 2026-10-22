import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { createDisposableDatabase, type DisposableDatabase } from './disposable-database'

describe('Committed migrations on an empty disposable PostgreSQL database', () => {
  let database: DisposableDatabase | undefined
  beforeAll(async () => { database = await createDisposableDatabase() })
  afterAll(async () => { await database?.dispose() })

  it('applies the complete SQL chain and preserves data on a second migrator run', async () => {
    if (!database) throw new Error('Banco descartável não inicializado.')
    const { client } = database
    expect(await client`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`).toHaveLength(0)
    await database.migrate()
    await database.seedGenres()
    const firstJournal = await client`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`
    const journal = JSON.parse(fs.readFileSync('server/db/migrations/meta/_journal.json', 'utf8')) as { entries: unknown[] }
    expect(firstJournal).toHaveLength(journal.entries.length)
    expect(new Set(firstJournal.map((entry) => entry.hash)).size).toBe(journal.entries.length)
    const tables = await client`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    expect(tables.map((table) => table.table_name)).toEqual(expect.arrayContaining([
      'users', 'works', 'authors', 'editions', 'work_authors', 'work_genres',
      'reading_logs', 'reading_blocks', 'comments', 'genres', 'search_misses', 'allowed_emails',
      'ba_user', 'account', 'session', 'verification', 'rate_limit',
    ]))
    const extensions = await client`SELECT extname FROM pg_extension`
    expect(extensions.map((extension) => extension.extname)).toEqual(expect.arrayContaining(['citext', 'unaccent', 'pg_trgm']))
    const [index] = await client`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'reading_logs_public_idx'`
    expect(index?.indexdef).toContain('(created_at DESC, id DESC)')
    expect(index?.indexdef).toContain("visibility = 'publico'")
    const auditConstraints = await client`SELECT conname FROM pg_constraint WHERE conname IN ('works_updated_by_users_id_fk', 'editions_updated_by_users_id_fk')`
    expect(auditConstraints).toHaveLength(2)
    const genres = await client`SELECT id, slug, label_pt, kind FROM genres ORDER BY id`
    expect(genres).toHaveLength(26)
    expect(genres[0]).toMatchObject({ id: 1, slug: 'ficcao', label_pt: 'Ficção', kind: 'ficcao' })
    const [work] = await client`INSERT INTO works (slug, title) VALUES ('migration-control', 'O Hóbbït') RETURNING id, search_text`
    expect(work?.search_text).toBe('o hobbit')
    await database.migrate()
    expect(Array.from(await client`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`)).toEqual(Array.from(firstJournal))
    expect(Array.from(await client`SELECT id, slug, label_pt, kind FROM genres ORDER BY id`)).toEqual(Array.from(genres))
    expect(Array.from(await client`SELECT id, search_text FROM works`)).toEqual([work])
  })
})
