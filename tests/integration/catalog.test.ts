import { createServer, type Server } from 'node:http'
import { createApp, createRouter, toNodeListener } from 'h3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { coverUrlSchema } from '../../shared/schemas/work'
import { removeFixtures } from './fixtures'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)

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
  let otherUserId: string
  let adminUserId: string
  let patchServer: Server
  let patchUrl: string

  beforeAll(async () => {
    const dbModule = await import('../../server/db')
    db = dbModule.db
    client = dbModule.client
    schema = await import('../../server/db/schema')
    catalog = await import('../../server/services/catalog')
    sqlOp = await import('drizzle-orm')

    const createdUsers = await db
      .insert(schema.users)
      .values([
        {
          email: `${MARKER}@example.com`,
          handle: `t${Date.now()}`.slice(0, 20),
          display_name: 'Usuário de teste',
        },
        {
          email: `${MARKER}-outro@example.com`,
          handle: `to${Date.now()}`.slice(0, 20),
          display_name: 'Outro usuário de teste',
        },
        {
          email: `${MARKER}-admin@example.com`,
          handle: `ta${Date.now()}`.slice(0, 20),
          display_name: 'Admin de teste',
          is_admin: true,
        },
      ])
      .returning({ id: schema.users.id })

    if (createdUsers.length !== 3 || !createdUsers[0] || !createdUsers[1] || !createdUsers[2]) {
      throw new Error('Não foi possível criar os usuários de teste.')
    }
    userId = createdUsers[0].id
    otherUserId = createdUsers[1].id
    adminUserId = createdUsers[2].id

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
    try {
      await removeFixtures(MARKER)
    } finally {
      await client?.end()
    }
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

    await catalog.createEdition(work.id, { isbn: null }, userId)
    await catalog.createEdition(work.id, { isbn: null }, userId)

    const isbn = uniqueTestIsbn13()
    await catalog.createEdition(work.id, { isbn }, userId)

    let caught: unknown
    try {

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

  it('refuses deletion of an edition created by member A when requested by member B with 403', async () => {
    const work = await catalog.createWork(
      {
        title: `${MARKER} Edição por A`,
        authors: [{ name: `${MARKER} Autor A` }],
        genre_ids: [],
        edition: { publisher: 'Editora A' },
      },
      userId,
    )
    if (!work.edition) throw new Error('A edição de teste não foi criada.')

    let caught: unknown
    try {
      await catalog.deleteEdition(work.edition.id, otherUserId)
    } catch (error) {
      caught = error
    }

    const err = asError(caught)
    expect(err.statusCode).toBe(403)
    expect(err.data?.error).toBe('sem_permissao')
    expect(err.data?.message).toBe(
      'Só quem cadastrou esta edição pode excluí-la, e só enquanto ninguém mais a usa em uma leitura.',
    )

    const [edition] = await db
      .select({ id: schema.editions.id })
      .from(schema.editions)
      .where(sqlOp.eq(schema.editions.id, work.edition.id))
    expect(edition).toBeDefined()
  })

  it('allows creator A to delete their own edition used only by their own reading', async () => {
    const work = await catalog.createWork(
      {
        title: `${MARKER} Edição própria lida por A`,
        authors: [{ name: `${MARKER} Autor Próprio` }],
        genre_ids: [],
        edition: { publisher: 'Editora Própria' },
      },
      userId,
    )
    if (!work.edition) throw new Error('A edição de teste não foi criada.')

    const [log] = await db
      .insert(schema.reading_logs)
      .values({
        user_id: userId,
        work_id: work.id,
        edition_id: work.edition.id,
        rating: '5.0',
      })
      .returning({ id: schema.reading_logs.id })
    if (!log) throw new Error('O registro de leitura de teste não foi criado.')

    await catalog.deleteEdition(work.edition.id, userId)

    const [edition] = await db
      .select({ id: schema.editions.id })
      .from(schema.editions)
      .where(sqlOp.eq(schema.editions.id, work.edition.id))
    expect(edition).toBeUndefined()

    const [survivor] = await db
      .select({ id: schema.reading_logs.id, edition_id: schema.reading_logs.edition_id })
      .from(schema.reading_logs)
      .where(sqlOp.eq(schema.reading_logs.id, log.id))
    expect(survivor?.id).toBe(log.id)
    expect(survivor?.edition_id).toBeNull()
  })

  it('refuses deletion by creator A when another user B references the edition with 403', async () => {
    const work = await catalog.createWork(
      {
        title: `${MARKER} Edição por A lida por B`,
        authors: [{ name: `${MARKER} Autor Compartilhado` }],
        genre_ids: [],
        edition: { publisher: 'Editora Compartilhada' },
      },
      userId,
    )
    if (!work.edition) throw new Error('A edição de teste não foi criada.')

    const [logB] = await db
      .insert(schema.reading_logs)
      .values({
        user_id: otherUserId,
        work_id: work.id,
        edition_id: work.edition.id,
        rating: '4.0',
      })
      .returning({ id: schema.reading_logs.id })
    if (!logB) throw new Error('O registro de leitura de teste não foi criado.')

    let caught: unknown
    try {
      await catalog.deleteEdition(work.edition.id, userId)
    } catch (error) {
      caught = error
    }

    const err = asError(caught)
    expect(err.statusCode).toBe(403)
    expect(err.data?.error).toBe('sem_permissao')
    expect(err.data?.message).toBe(
      'Só quem cadastrou esta edição pode excluí-la, e só enquanto ninguém mais a usa em uma leitura.',
    )

    const [edition] = await db
      .select({ id: schema.editions.id })
      .from(schema.editions)
      .where(sqlOp.eq(schema.editions.id, work.edition.id))
    expect(edition).toBeDefined()
  })

  it('allows an admin to delete an edition created by B and used by A', async () => {
    const work = await catalog.createWork(
      {
        title: `${MARKER} Edição por B lida por A`,
        authors: [{ name: `${MARKER} Autor Para Admin` }],
        genre_ids: [],
        edition: { publisher: 'Editora Para Admin' },
      },
      otherUserId,
    )
    if (!work.edition) throw new Error('A edição de teste não foi criada.')

    const [logA] = await db
      .insert(schema.reading_logs)
      .values({
        user_id: userId,
        work_id: work.id,
        edition_id: work.edition.id,
        rating: '3.0',
      })
      .returning({ id: schema.reading_logs.id })
    if (!logA) throw new Error('O registro de leitura de teste não foi criado.')

    await catalog.deleteEdition(work.edition.id, adminUserId)

    const [edition] = await db
      .select({ id: schema.editions.id })
      .from(schema.editions)
      .where(sqlOp.eq(schema.editions.id, work.edition.id))
    expect(edition).toBeUndefined()

    const [survivor] = await db
      .select({ id: schema.reading_logs.id, edition_id: schema.reading_logs.edition_id })
      .from(schema.reading_logs)
      .where(sqlOp.eq(schema.reading_logs.id, logA.id))
    expect(survivor?.id).toBe(logA.id)
    expect(survivor?.edition_id).toBeNull()
  })

  it('returns 404 when deleting an unknown edition id', async () => {
    let caught: unknown
    try {
      await catalog.deleteEdition('00000000-0000-4000-8000-000000000000', userId)
    } catch (error) {
      caught = error
    }

    const err = asError(caught)
    expect(err.statusCode).toBe(404)
    expect(err.data?.error).toBe('nao_encontrado')
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
