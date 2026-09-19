import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDatabaseUrl)('Database connection (Neon)', () => {
  let dbClient: { end: () => Promise<void> } | undefined

  afterAll(async () => {
    if (dbClient) {
      await dbClient.end()
    }
  })

  it('runs "select 1" through db and returns 1', async () => {
    const { db, client } = await import('../../server/db/index')
    dbClient = client

    const result = await db.execute<{ result: number }>(sql`select 1 as result`)
    const firstRow = result[0]
    if (!firstRow) {
      throw new Error('Nenhuma linha retornada pelo banco de dados.')
    }
    expect(Number(firstRow.result)).toBe(1)
  })
})
