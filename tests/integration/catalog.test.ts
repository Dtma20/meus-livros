import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { coverUrlSchema } from '../../shared/schemas/work'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)

/** Every row this file creates carries this marker so cleanup can find it. */
const MARKER = `zz-teste-catalogo-${Date.now()}`

interface H3ErrorLike {
  statusCode?: number
  data?: { error?: string, message?: string, work?: { id: string } }
}

function asError(caught: unknown): H3ErrorLike {
  return caught as H3ErrorLike
}

describe.skipIf(!hasDatabaseUrl)('Catalog services', () => {
  let db: typeof import('../../server/db')['db']
  let client: typeof import('../../server/db')['client']
  let schema: typeof import('../../server/db/schema')
  let catalog: typeof import('../../server/services/catalog')
  let sqlOp: typeof import('drizzle-orm')
  let userId: string

  beforeAll(async () => {
    const dbModule = await import('../../server/db')
    db = dbModule.db
    client = dbModule.client
    schema = await import('../../server/db/schema')
    catalog = await import('../../server/services/catalog')
    sqlOp = await import('drizzle-orm')

    const [user] = await db
      .insert(schema.users)
      .values({
        email: `${MARKER}@example.com`,
        handle: `t${Date.now()}`.slice(0, 20),
        display_name: 'Usuário de teste',
      })
      .returning({ id: schema.users.id })

    if (!user) throw new Error('Não foi possível criar o usuário de teste.')
    userId = user.id
  })

  afterAll(async () => {
    if (!userId) return
    // works -> editions and work_authors cascade; reading_logs is RESTRICT but
    // this file never creates one.
    await db.delete(schema.works).where(sqlOp.eq(schema.works.created_by, userId))
    await db.delete(schema.authors).where(sqlOp.eq(schema.authors.created_by, userId))
    await db.delete(schema.users).where(sqlOp.eq(schema.users.id, userId))
    await client.end()
  })

  it('creates a work with a negative first_published_year and reads it back', async () => {
    const created = await catalog.createWork(
      {
        title: `${MARKER} Fábulas`,
        authors: [{ name: `${MARKER} Esopo` }],
        first_published_year: -500,
        genre_ids: [],
      },
      userId,
    )

    const [row] = await db
      .select({ year: schema.works.first_published_year })
      .from(schema.works)
      .where(sqlOp.eq(schema.works.id, created.id))

    expect(row?.year).toBe(-500)
  })

  it('round-trips series_number values that are not numbers', async () => {
    for (const value of ['1-2', '0.1']) {
      const created = await catalog.createWork(
        {
          title: `${MARKER} Série ${value}`,
          authors: [{ name: `${MARKER} Autor Série` }],
          series_name: 'Uma série',
          series_number: value,
          genre_ids: [],
        },
        userId,
      )

      const [row] = await db
        .select({ number: schema.works.series_number })
        .from(schema.works)
        .where(sqlOp.eq(schema.works.id, created.id))

      expect(row?.number).toBe(value)
    }
  })

  it('returns 409 with the existing work on a duplicate title and author', async () => {
    const input = {
      title: `${MARKER} Duplicata`,
      authors: [{ name: `${MARKER} Autor Duplicata` }],
      genre_ids: [],
    }

    const first = await catalog.createWork(input, userId)

    let caught: unknown
    try {
      await catalog.createWork(input, userId)
    } catch (error) {
      caught = error
    }

    const err = asError(caught)
    expect(err.statusCode).toBe(409)
    expect(err.data?.error).toBe('conflito')
    expect(err.data?.work?.id).toBe(first.id)
  })

  it('creates the duplicate anyway when forced', async () => {
    const input = {
      title: `${MARKER} Forçada`,
      authors: [{ name: `${MARKER} Autor Forçada` }],
      genre_ids: [],
    }

    const first = await catalog.createWork(input, userId)
    const second = await catalog.createWork(input, userId, { force: true })

    expect(second.id).not.toBe(first.id)
    expect(second.slug).not.toBe(first.slug)
  })

  it('accepts two editions with no ISBN and rejects a repeated one', async () => {
    const work = await catalog.createWork(
      {
        title: `${MARKER} Edições`,
        authors: [{ name: `${MARKER} Autor Edições` }],
        genre_ids: [],
      },
      userId,
    )

    // "No ISBN" is a repeatable legal state — that is what the partial unique
    // index is for. Three books in the corpus need it.
    await catalog.createEdition(work.id, { isbn: null }, userId)
    await catalog.createEdition(work.id, { isbn: null }, userId)

    await catalog.createEdition(work.id, { isbn: '9788535902778' }, userId)

    let caught: unknown
    try {
      // The same ISBN in ISBN-10 spelling: normalisation must catch it.
      await catalog.createEdition(work.id, { isbn: '8535902775' }, userId)
    } catch (error) {
      caught = error
    }

    const err = asError(caught)
    expect(err.statusCode).toBe(409)
    expect(err.data?.error).toBe('conflito')
  })

  it('returns 404 for an edition on a work that does not exist', async () => {
    let caught: unknown
    try {
      await catalog.createEdition('00000000-0000-0000-0000-000000000000', { isbn: null }, userId)
    } catch (error) {
      caught = error
    }
    expect(asError(caught).statusCode).toBe(404)
  })

  it('rejects genre ids that do not exist', async () => {
    let caught: unknown
    try {
      await catalog.createWork(
        {
          title: `${MARKER} Gênero inválido`,
          authors: [{ name: `${MARKER} Autor Gênero` }],
          genre_ids: [9999],
        },
        userId,
      )
    } catch (error) {
      caught = error
    }
    expect(asError(caught).statusCode).toBe(400)
  })

  it('returns 429 for the 31st work in an hour', async () => {
    const [limited] = await db
      .insert(schema.users)
      .values({
        email: `${MARKER}-limite@example.com`,
        handle: `l${Date.now()}`.slice(0, 20),
        display_name: 'Usuário no limite',
      })
      .returning({ id: schema.users.id })

    if (!limited) throw new Error('Não foi possível criar o usuário de teste do limite.')

    try {
      await db.insert(schema.works).values(
        Array.from({ length: 30 }, (_, i) => ({
          slug: `${MARKER}-limite-${i}`,
          title: `${MARKER} Limite ${i}`,
          created_by: limited.id,
        })),
      )

      let caught: unknown
      try {
        await catalog.createWork(
          {
            title: `${MARKER} Trigésima primeira`,
            authors: [{ name: `${MARKER} Autor Limite` }],
            genre_ids: [],
          },
          limited.id,
        )
      } catch (error) {
        caught = error
      }

      const err = asError(caught)
      expect(err.statusCode).toBe(429)
      expect(err.data?.error).toBe('limite_excedido')
    } finally {
      await db.delete(schema.works).where(sqlOp.eq(schema.works.created_by, limited.id))
      await db.delete(schema.authors).where(sqlOp.eq(schema.authors.created_by, limited.id))
      await db.delete(schema.users).where(sqlOp.eq(schema.users.id, limited.id))
    }
  })
})

describe('coverUrlSchema', () => {
  it('rejects a javascript: URL before it can reach an <img src>', () => {
    expect(coverUrlSchema.safeParse('javascript:alert(1)').success).toBe(false)
  })

  it('rejects data: and http:', () => {
    expect(coverUrlSchema.safeParse('data:image/svg+xml,<svg/>').success).toBe(false)
    expect(coverUrlSchema.safeParse('http://exemplo.com/capa.jpg').success).toBe(false)
  })

  it('accepts https:', () => {
    expect(coverUrlSchema.safeParse('https://covers.openlibrary.org/b/id/1-M.jpg').success).toBe(true)
  })
})
