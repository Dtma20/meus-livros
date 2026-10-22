import { randomUUID } from 'node:crypto'
import path from 'node:path'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { GENRES_SEED } from '../../scripts/seed-genres'

// DDL/import tests use a new database, never the configured application's schema.
export async function createDisposableDatabase() {
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL || process.env.DATABASE_URL
  if (!adminUrl?.trim()) throw new Error('DATABASE_URL ou TEST_DATABASE_ADMIN_URL é necessária para criar o banco descartável.')
  const admin = postgres(adminUrl, { max: 1, connect_timeout: 7 })
  const name = `meus_livros_test_${randomUUID().replaceAll('-', '')}`
  try {
    await admin.unsafe(`CREATE DATABASE "${name}"`)
  } catch (cause) {
    await admin.end()
    throw new Error('Os testes de migração/importação exigem permissão CREATE DATABASE. Configure TEST_DATABASE_ADMIN_URL com um PostgreSQL de teste.', { cause })
  }
  const url = new URL(adminUrl)
  url.pathname = `/${name}`
  const client = postgres(url.toString(), { max: 1, connect_timeout: 7 })
  const db = drizzle(client)
  let disposed = false
  return {
    name,
    url: url.toString(),
    client,
    db,
    async migrate() {
      await migrate(db, { migrationsFolder: path.resolve('server/db/migrations') })
    },
    async seedGenres() {
      await client`INSERT INTO genres ${client([...GENRES_SEED])}`
    },
    async dispose() {
      if (disposed) return
      await client.end()
      try {
        await admin.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`)
        disposed = true
      } finally {
        await admin.end()
      }
    },
  }
}

export type DisposableDatabase = Awaited<ReturnType<typeof createDisposableDatabase>>
