import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { removeFixtures, trackSetup } from './fixtures'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)
const MARKER = `t016-${Date.now()}`

interface H3ErrorLike {
  statusCode?: number
  data?: { error?: string; message?: string }
}

function asError(caught: unknown): H3ErrorLike {
  return caught as H3ErrorLike
}

describe.skipIf(!hasDatabaseUrl)('TASK-016 — Profile page and visibility integration tests', () => {
  let db: typeof import('../../server/db')['db']
  let schema: typeof import('../../server/db/schema')
  let profilesService: typeof import('../../server/services/profiles')
  let catalogService: typeof import('../../server/services/catalog')

  const setup = trackSetup()

  let publicOwnerId: string
  let publicOwnerHandle: string
  let privateOwnerId: string
  let privateOwnerHandle: string

  beforeAll(() => setup.run(async () => {
    const dbModule = await import('../../server/db')
    db = dbModule.db
    schema = await import('../../server/db/schema')
    profilesService = await import('../../server/services/profiles')
    catalogService = await import('../../server/services/catalog')

    // 1. Create a user with a public profile
    const email1 = `${MARKER}-pub@example.com`
    publicOwnerHandle = `upub_${Date.now() % 10000000}`

    const [pubUser] = await db
      .insert(schema.users)
      .values({
        email: email1,
        handle: publicOwnerHandle,
        display_name: 'Usuário Perfil Público',
        bio: 'Biografia pública de teste',
        profile_visibility: 'publico',
      })
      .returning({ id: schema.users.id })

    publicOwnerId = pubUser!.id

    // 2. Create a user with a private profile
    const email2 = `${MARKER}-priv@example.com`
    privateOwnerHandle = `upriv_${Date.now() % 10000000}`

    const [privUser] = await db
      .insert(schema.users)
      .values({
        email: email2,
        handle: privateOwnerHandle,
        display_name: 'Usuário Perfil Privado',
        bio: 'Biografia privada de teste',
        profile_visibility: 'privado',
      })
      .returning({ id: schema.users.id })

    privateOwnerId = privUser!.id

    // 3. For the public profile user, create 7 works (5 will have public logs, 2 will have private logs)
    // Authors from different countries to test unique authors & countries
    for (let i = 1; i <= 7; i++) {
      const isPublicLog = i <= 5
      const countryCode = i === 1 ? 'BR' : i === 2 ? 'GB' : i === 3 ? 'US' : null
      const countryLabel = i === 4 ? 'Roma Antiga' : null

      const createdWork = await catalogService.createWork(
        {
          title: `${MARKER} Obra ${i}`,
          authors: [
            {
              name: `${MARKER} Autor ${i}`,
              country_code: countryCode,
              country_label: countryLabel,
            },
          ],
          genre_ids: [],
          edition: {
            publisher: `Editora ${i}`,
            page_count: 100 * i,
          },
        },
        publicOwnerId,
        { skipRateLimit: true },
      )

      // Insert reading log: 5 public, 2 private
      const createdAt = new Date(Date.now() - (10 - i) * 60000)
      await db.insert(schema.reading_logs).values({
        user_id: publicOwnerId,
        work_id: createdWork.id,
        edition_id: createdWork.edition?.id ?? null,
        rating: String(4.0),
        review: `Resenha ${i}`,
        finished_on: `2024-01-0${i}`,
        finished_precision: 'dia',
        format: 'fisico',
        visibility: isPublicLog ? 'publico' : 'privado',
        created_at: createdAt,
        updated_at: createdAt,
      })
    }

    // 4. For the private profile user, create 1 work with 1 public log
    const privProfileWork = await catalogService.createWork(
      {
        title: `${MARKER} Obra Privada`,
        authors: [{ name: `${MARKER} Autor Privado` }],
        genre_ids: [],
        edition: {
          publisher: 'Editora Privada',
          page_count: 250,
        },
      },
      privateOwnerId,
      { skipRateLimit: true },
    )
    await db.insert(schema.reading_logs).values({
      user_id: privateOwnerId,
      work_id: privProfileWork.id,
      edition_id: privProfileWork.edition?.id ?? null,
      rating: '5.0',
      review: 'Resenha privada',
      finished_on: '2024-02-01',
      finished_precision: 'dia',
      format: 'fisico',
      visibility: 'publico',
    })
  }))

  afterAll(async () => {
    await setup.settled()
    await removeFixtures(MARKER)
  })

  it('a profile with 5 public and 2 private entries shows 5 to a stranger and 7 to the owner', async () => {
    // Stranger view (viewer === null)
    const strangerView = await profilesService.getProfileByHandle(publicOwnerHandle, null)
    expect(strangerView.logs).toHaveLength(5)
    // All logs must be public
    for (const log of strangerView.logs) {
      expect(log.visibility).toBe('publico')
    }

    // Owner view (viewer === { id: publicOwnerId })
    const ownerView = await profilesService.getProfileByHandle(publicOwnerHandle, { id: publicOwnerId })
    expect(ownerView.logs).toHaveLength(7)
    const privateLogs = ownerView.logs.filter((l) => l.visibility === 'privado')
    expect(privateLogs).toHaveLength(2)
  }, 20000)

  it('stat counters match the visible set for each viewer (does not leak private count)', async () => {
    // Stranger view
    const strangerView = await profilesService.getProfileByHandle(publicOwnerHandle, null)
    expect(strangerView.stats.totalBooks).toBe(5)
    // Pages for 5 public books: 100 + 200 + 300 + 400 + 500 = 1500
    expect(strangerView.stats.totalPages).toBe(1500)

    // Owner view
    const ownerView = await profilesService.getProfileByHandle(publicOwnerHandle, { id: publicOwnerId })
    expect(ownerView.stats.totalBooks).toBe(7)
    // Pages for 7 books: 1500 + 600 + 700 = 2800
    expect(ownerView.stats.totalPages).toBe(2800)
  }, 20000)

  it('a privado profile returns 404 to a stranger and 200 to its owner', async () => {
    // Stranger view must throw 404
    let strangerError: unknown
    try {
      await profilesService.getProfileByHandle(privateOwnerHandle, null)
    } catch (err) {
      strangerError = err
    }
    expect(strangerError).toBeDefined()
    const sErr = asError(strangerError)
    expect(sErr.statusCode).toBe(404)
    expect(sErr.data?.error).toBe('nao_encontrado')

    // Different authenticated user (not the owner) must also get 404
    let otherUserError: unknown
    try {
      await profilesService.getProfileByHandle(privateOwnerHandle, { id: publicOwnerId })
    } catch (err) {
      otherUserError = err
    }
    expect(otherUserError).toBeDefined()
    expect(asError(otherUserError).statusCode).toBe(404)

    // Owner view must succeed with 200
    const ownerView = await profilesService.getProfileByHandle(privateOwnerHandle, { id: privateOwnerId })
    expect(ownerView.user.handle).toBe(privateOwnerHandle)
    expect(ownerView.logs).toHaveLength(1)
  }, 20000)

  it('an unknown handle returns 404', async () => {
    let unknownError: unknown
    try {
      await profilesService.getProfileByHandle(`nonexistent_${Date.now()}`, null)
    } catch (err) {
      unknownError = err
    }
    expect(unknownError).toBeDefined()
    const err = asError(unknownError)
    expect(err.statusCode).toBe(404)
    expect(err.data?.error).toBe('nao_encontrado')
  }, 20000)
})
