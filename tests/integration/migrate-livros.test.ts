import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDisposableDatabase, type DisposableDatabase } from './disposable-database'

const runFile = promisify(execFile)

describe('Real legacy importer in disposable database and working directory', () => {
  let database: DisposableDatabase | undefined
  let directory: string | undefined
  const repo = process.cwd()

  beforeAll(async () => {
    database = await createDisposableDatabase()
    await database.migrate()
    await database.seedGenres()
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'meus-livros-import-'))
    await fs.mkdir(path.join(directory, 'legacy'))
    await fs.copyFile(path.join(repo, 'legacy/livros.json'), path.join(directory, 'legacy/livros.json'))
    await fs.writeFile(path.join(directory, 'legacy/livros_lidos_atualizado.csv'), 'obsolete')
  })

  afterAll(async () => {
    try { await database?.dispose() } finally {
      if (directory) await fs.rm(directory, { recursive: true, force: true })
    }
  })

  it('persists books, editions, reading precision and temporal ordering through the real CLI', async () => {
    if (!database || !directory) throw new Error('Fixture de importação não inicializada.')
    const { client } = database
    const result = await runFile(process.execPath, [
      path.join(repo, 'node_modules/tsx/dist/cli.mjs'), path.join(repo, 'scripts/migrate-livros.ts'),
    ], {
      cwd: directory,
      timeout: 30_000,
      env: {
        ...process.env,
        DATABASE_URL: database.url,
        DATABASE_URL_DIRECT: database.url,
        DOTENV_CONFIG_PATH: path.join(directory, 'absent.env'),
        OWNER_EMAIL: 'legacy-owner@test.invalid', OWNER_HANDLE: 'legacy_owner', OWNER_NAME: 'Legacy Owner',
      },
    })
    expect(result.stdout).toContain('Migração concluída com sucesso: 86 obras, 86 edições, 86 logs.')
    const [totals] = await client`SELECT
      (SELECT count(*)::int FROM works) AS works,
      (SELECT count(*)::int FROM editions) AS editions,
      (SELECT count(*)::int FROM reading_logs) AS logs,
      (SELECT count(*)::int FROM authors) AS authors,
      (SELECT count(*)::int FROM editions WHERE isbn13 IS NOT NULL) AS isbns,
      (SELECT count(*)::int FROM editions WHERE isbn13 IS NULL) AS asins`
    expect(totals).toEqual({ works: 86, editions: 86, logs: 86, authors: 60, isbns: 83, asins: 3 })
    const ancient = await client`SELECT title, first_published_year FROM works WHERE first_published_year < 0 ORDER BY first_published_year`
    expect(Array.from(ancient)).toEqual([
      { title: 'A Arte da Guerra', first_published_year: -500 },
      { title: 'A Brevidade da Vida', first_published_year: -49 },
    ])
    const series = await client`SELECT title, series_number FROM works WHERE series_number IN ('1-2', '0.1') ORDER BY series_number`
    expect(Array.from(series)).toEqual([
      { title: 'Eu, robô', series_number: '0.1' },
      { title: 'Pollyanna e Pollyanna moça', series_number: '1-2' },
    ])
    const logs = await client`SELECT w.title, l.finished_on::text AS finished_on, l.finished_precision,
      to_char(l.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
      e.work_id = l.work_id AS edition_matches
      FROM reading_logs l JOIN works w ON w.id = l.work_id
      JOIN editions e ON e.id = l.edition_id ORDER BY l.created_at`
    expect(logs).toHaveLength(86)
    expect(logs.every((log) => log.finished_precision === 'ano' && log.finished_on.endsWith('-01-01') && log.edition_matches)).toBe(true)
    expect(new Set(logs.map((log) => log.created_at)).size).toBe(86)
    expect(logs.find((log) => log.title === 'Percy Jackson e o ladrão de raios')).toMatchObject({
      finished_on: '2014-01-01', created_at: '2014-01-01T00:00:00.000Z',
    })
    expect(logs.find((log) => log.title === 'Percy Jackson e o mar de monstros')?.created_at).toBe('2015-01-01T00:01:00.000Z')
    expect(logs.find((log) => log.title === 'Percy Jackson e a maldição do titã')?.created_at).toBe('2015-01-01T00:02:00.000Z')
    const input: Array<{ title: string; read_in: number }> = JSON.parse(await fs.readFile(path.join(directory, 'legacy/livros.json'), 'utf8'))
    for (const year of new Set(input.map((book) => book.read_in))) {
      // Compare persisted order to the input order, not a duplicate timestamp formula.
      expect(logs.filter((log) => log.finished_on.startsWith(`${year}-`)).map((log) => log.title))
        .toEqual(input.filter((book) => book.read_in === year).map((book) => book.title))
    }
    expect(Array.from(await client`SELECT id FROM reading_logs WHERE review LIKE '%<%'`)).toEqual([])
    const [ratings] = await client`SELECT count(*)::int AS n FROM reading_logs WHERE rating IS NOT NULL`
    expect(ratings?.n).toBe(85)
    const genreFile = await fs.readFile(path.join(directory, 'legacy/generos.txt'), 'utf8')
    expect(genreFile.split(/\r?\n/).filter((line) => line.startsWith('- '))).toHaveLength(26)
    await expect(fs.access(path.join(directory, 'legacy/livros_lidos_atualizado.csv'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
