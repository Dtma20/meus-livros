import { createServer, type Server } from 'node:http'
import { createApp, createRouter, toNodeListener } from 'h3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { coverUrlSchema } from '../../shared/schemas/work'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)

/** Every row this file creates carries this marker so cleanup can find it. */
const MARKER = `zz-teste-catalogo-${Date.now()}`
let isbnSeed = Date.now() % 1_000_000_000

function uniqueTestIsbn13(): string {
  const body = `979${String(isbnSeed++).padStart(9, '0')}`
  let sum = 0
  for (let index = 0; index < body.length; index++) {
    sum += Number(body[index]) * (index % 2 === 0 ? 1 : 3)
  }
  return body + String((10 - (sum % 10)) % 10)
}

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
  let patchServer: Server
  let patchUrl: string

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

    const app = createApp()
    const router = createRouter()
    const { default: workPatch } = await import('../../server/api/works/[id].patch')
    router.patch('/api/works/:id', workPatch)
    app.use(router)
    patchServer = createServer(toNodeListener(app))
    await new Promise<void>((resolve) => {
      patchServer.listen(0, '127.0.0.1', () => resolve())
    })
    const address = patchServer.address()
    const port = typeof address === 'object' && address ? address.port : 0
    patchUrl = `http://127.0.0.1:${port}/api/works`
  })

  afterAll(async () => {
    if (patchServer) {
      await new Promise<void>((resolve) => patchServer.close(() => resolve()))
    }
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

    const isbn = uniqueTestIsbn13()
    await catalog.createEdition(work.id, { isbn }, userId)

    let caught: unknown
    try {
      // Repeating the same normalised ISBN must be a conflict.
      await catalog.createEdition(work.id, { isbn }, userId)
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

  it('returns 409 when a work update creates a title and author duplicate', async () => {
    const author = `${MARKER} Autor duplicado na edição`
    const first = await catalog.createWork(
      {
        title: `${MARKER} Título duplicado na edição`,
        authors: [{ name: author }],
        genre_ids: [],
      },
      userId,
    )
    const second = await catalog.createWork(
      {
        title: `${MARKER} Título original na edição`,
        authors: [{ name: author }],
        genre_ids: [],
      },
      userId,
    )

    let caught: unknown
    try {
      await catalog.updateWork(second.id, { title: `${MARKER} Título duplicado na edição` }, userId)
    } catch (error) {
      caught = error
    }

    expect(asError(caught).statusCode).toBe(409)
    expect(asError(caught).data?.error).toBe('conflito')
    expect(asError(caught).data?.work?.id).toBe(first.id)
  })

  it('normalises an invalid edition ISBN to null and allows another null ISBN', async () => {
    const work = await catalog.createWork(
      {
        title: `${MARKER} Edições ISBN inválido`,
        authors: [{ name: `${MARKER} Autor ISBN inválido` }],
        genre_ids: [],
      },
      userId,
    )
    const first = await catalog.createEdition(work.id, { isbn: uniqueTestIsbn13() }, userId)
    const second = await catalog.createEdition(work.id, { isbn: null }, userId)

    await catalog.updateEdition(first.id, { isbn: 'não é ISBN' }, userId)

    const rows = await db
      .select({ id: schema.editions.id, isbn13: schema.editions.isbn13 })
      .from(schema.editions)
      .where(sqlOp.inArray(schema.editions.id, [first.id, second.id]))
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.isbn13 === null)).toBe(true)
  })

  it('deletes an orphan edition without checking its creator', async () => {
    const work = await catalog.createWork(
      {
        title: `${MARKER} Edição órfã`,
        authors: [{ name: `${MARKER} Autor edição órfã` }],
        genre_ids: [],
        edition: { publisher: 'Editora' },
      },
      userId,
    )
    if (!work.edition) throw new Error('A edição de teste não foi criada.')

    await catalog.deleteEdition(work.edition.id, '00000000-0000-4000-8000-000000000000')

    const [edition] = await db
      .select({ id: schema.editions.id })
      .from(schema.editions)
      .where(sqlOp.eq(schema.editions.id, work.edition.id))
    expect(edition).toBeUndefined()
  })

  it('returns 401 for a work PATCH without a session', async () => {
    const response = await fetch(`${patchUrl}/00000000-0000-4000-8000-000000000000`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: `${MARKER} sem sessão` }),
      signal: AbortSignal.timeout(10_000),
    })

    expect(response.status).toBe(401)
    const body = await response.json() as { error?: string }
    expect(body.error).toBe('nao_autenticado')
  }, 20_000)

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

  it('allows creating beyond 30 works when skipRateLimit is true', async () => {
    const [limited] = await db
      .insert(schema.users)
      .values({
        email: `${MARKER}-limite-skip@example.com`,
        handle: `ls${Date.now()}`.slice(0, 20),
        display_name: 'Usuário limite skip',
      })
      .returning({ id: schema.users.id })

    if (!limited) throw new Error('Não foi possível criar o usuário de teste do limite.')

    try {
      await db.insert(schema.works).values(
        Array.from({ length: 30 }, (_, i) => ({
          slug: `${MARKER}-limite-skip-${i}`,
          title: `${MARKER} Limite Skip ${i}`,
          created_by: limited.id,
        })),
      )

      const created = await catalog.createWork(
        {
          title: `${MARKER} Trigésima primeira com skipRateLimit`,
          authors: [{ name: `${MARKER} Autor Limite Skip` }],
          genre_ids: [],
        },
        limited.id,
        { skipRateLimit: true },
      )

      expect(created.id).toBeDefined()
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
