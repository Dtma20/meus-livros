import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { removeFixtures, trackSetup } from './fixtures'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)
const MARKER = `t060-${Date.now()}`

interface H3ErrorLike {
  statusCode?: number
  data?: { error?: string; message?: string }
}

function asError(caught: unknown): H3ErrorLike {
  return caught as H3ErrorLike
}

describe.skipIf(!hasDatabaseUrl)('TASK-060 - Reading statistics service integration tests', () => {
  let db: typeof import('../../server/db')['db']
  let schema: typeof import('../../server/db/schema')
  let statsService: typeof import('../../server/services/stats')
  let catalogService: typeof import('../../server/services/catalog')

  const setup = trackSetup()

  let publicOwnerId: string
  let publicOwnerHandle: string
  let privateOwnerId: string
  let privateOwnerHandle: string
  let otherMemberId: string
  let otherMemberHandle: string
  let coAuthorOwnerId: string
  let coAuthorOwnerHandle: string
  let coAuthor1Name: string
  let coAuthor2Name: string

  beforeAll(() => setup.run(async () => {
    const dbModule = await import('../../server/db')
    db = dbModule.db
    schema = await import('../../server/db/schema')
    statsService = await import('../../server/services/stats')
    catalogService = await import('../../server/services/catalog')

    const email1 = `${MARKER}-pub@example.com`
    publicOwnerHandle = `upub_${Date.now() % 10000000}`
    const [pubUser] = await db
      .insert(schema.users)
      .values({
        email: email1,
        handle: publicOwnerHandle,
        display_name: 'Usuário Público Estatísticas',
        profile_visibility: 'publico',
      })
      .returning({ id: schema.users.id })
    publicOwnerId = pubUser!.id

    const email2 = `${MARKER}-priv@example.com`
    privateOwnerHandle = `upriv_${Date.now() % 10000000}`
    const [privUser] = await db
      .insert(schema.users)
      .values({
        email: email2,
        handle: privateOwnerHandle,
        display_name: 'Usuário Privado Estatísticas',
        profile_visibility: 'privado',
      })
      .returning({ id: schema.users.id })
    privateOwnerId = privUser!.id

    const email3 = `${MARKER}-other@example.com`
    otherMemberHandle = `uoth_${Date.now() % 10000000}`
    const [otherUser] = await db
      .insert(schema.users)
      .values({
        email: email3,
        handle: otherMemberHandle,
        display_name: 'Outro Membro',
        profile_visibility: 'publico',
      })
      .returning({ id: schema.users.id })
    otherMemberId = otherUser!.id

    const email4 = `${MARKER}-coauthor@example.com`
    coAuthorOwnerHandle = `ucoa_${Date.now() % 10000000}`
    const [coUser] = await db
      .insert(schema.users)
      .values({
        email: email4,
        handle: coAuthorOwnerHandle,
        display_name: 'Usuário Coautoria',
        profile_visibility: 'publico',
      })
      .returning({ id: schema.users.id })
    coAuthorOwnerId = coUser!.id

    const work1 = await catalogService.createWork(
      {
        title: `${MARKER} Obra 1`,
        authors: [{ name: `${MARKER} Autor 1`, country_code: 'BR' }],
        genre_ids: [],
        edition: {
          publisher: 'Editora 1',
          page_count: 100,
        },
      },
      publicOwnerId,
      { skipRateLimit: true },
    )
    await db.insert(schema.reading_logs).values({
      user_id: publicOwnerId,
      work_id: work1.id,
      edition_id: work1.edition?.id ?? null,
      rating: '4.0',
      finished_on: '2024-03-01',
      finished_precision: 'dia',
      format: 'fisico',
      visibility: 'publico',
    })

    const work2 = await catalogService.createWork(
      {
        title: `${MARKER} Obra 2`,
        authors: [{ name: `${MARKER} Autor 2`, country_code: 'GB' }],
        genre_ids: [],
        edition: {
          publisher: 'Editora 2',
          page_count: 200,
        },
      },
      publicOwnerId,
      { skipRateLimit: true },
    )
    await db.insert(schema.reading_logs).values({
      user_id: publicOwnerId,
      work_id: work2.id,
      edition_id: work2.edition?.id ?? null,
      rating: '5.0',
      finished_on: '2024-06-15',
      finished_precision: 'dia',
      format: 'ebook',
      visibility: 'publico',
    })

    const work3 = await catalogService.createWork(
      {
        title: `${MARKER} Obra 3`,
        authors: [{ name: `${MARKER} Autor 3`, country_code: 'US' }],
        genre_ids: [],
        edition: {
          publisher: 'Editora 3',
          page_count: 300,
        },
      },
      publicOwnerId,
      { skipRateLimit: true },
    )
    await db.insert(schema.reading_logs).values({
      user_id: publicOwnerId,
      work_id: work3.id,
      edition_id: null,
      rating: null,
      finished_on: '2024-09-20',
      finished_precision: 'dia',
      format: 'audio',
      visibility: 'publico',
    })

    const work4 = await catalogService.createWork(
      {
        title: `${MARKER} Obra 4`,
        authors: [{ name: `${MARKER} Autor 4`, country_code: 'PT' }],
        genre_ids: [],
        edition: {
          publisher: 'Editora 4',
          page_count: 150,
        },
      },
      publicOwnerId,
      { skipRateLimit: true },
    )
    await db.insert(schema.reading_logs).values({
      user_id: publicOwnerId,
      work_id: work4.id,
      edition_id: work4.edition?.id ?? null,
      rating: '3.5',
      finished_on: '2025-01-10',
      finished_precision: 'dia',
      format: 'fisico',
      visibility: 'publico',
    })

    const work5 = await catalogService.createWork(
      {
        title: `${MARKER} Obra 5 Privada`,
        authors: [{ name: `${MARKER} Autor 5` }],
        genre_ids: [],
        edition: {
          publisher: 'Editora 5',
          page_count: 120,
        },
      },
      publicOwnerId,
      { skipRateLimit: true },
    )
    await db.insert(schema.reading_logs).values({
      user_id: publicOwnerId,
      work_id: work5.id,
      edition_id: work5.edition?.id ?? null,
      rating: '4.5',
      finished_on: '2024-11-01',
      finished_precision: 'dia',
      format: 'ebook',
      visibility: 'privado',
    })

    const work6 = await catalogService.createWork(
      {
        title: `${MARKER} Obra 6 Nao Terminada`,
        authors: [{ name: `${MARKER} Autor 6` }],
        genre_ids: [],
        edition: {
          publisher: 'Editora 6',
          page_count: 220,
        },
      },
      publicOwnerId,
      { skipRateLimit: true },
    )
    await db.insert(schema.reading_logs).values({
      user_id: publicOwnerId,
      work_id: work6.id,
      edition_id: work6.edition?.id ?? null,
      rating: null,
      started_on: '2024-01-01',
      finished_on: null,
      finished_precision: 'dia',
      format: 'fisico',
      visibility: 'publico',
    })

    coAuthor1Name = `${MARKER} Autor 7A`
    coAuthor2Name = `${MARKER} Autor 7B`
    const work7 = await catalogService.createWork(
      {
        title: `${MARKER} Obra 7 Dois Autores`,
        authors: [
          { name: coAuthor1Name, country_code: 'FR' },
          { name: coAuthor2Name, country_code: 'FR' },
        ],
        genre_ids: [],
        edition: {
          publisher: 'Editora 7',
          page_count: 180,
        },
      },
      coAuthorOwnerId,
      { skipRateLimit: true },
    )
    await db.insert(schema.reading_logs).values({
      user_id: coAuthorOwnerId,
      work_id: work7.id,
      edition_id: work7.edition?.id ?? null,
      rating: '4.0',
      finished_on: '2024-08-01',
      finished_precision: 'dia',
      format: 'fisico',
      visibility: 'publico',
    })

    const privWork = await catalogService.createWork(
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
      work_id: privWork.id,
      edition_id: privWork.edition?.id ?? null,
      rating: '5.0',
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

  it('aggregates finished public logs across all years for anonymous viewer when year is null', async () => {
    const stats = await statsService.getReadingStats(publicOwnerHandle, null, null)

    expect(stats.totals.books).toBe(4)
    expect(stats.totals.pages).toBe(750)
    expect(stats.years).toEqual([2024, 2025])
    expect(stats.byYear).toEqual([
      { year: 2024, books: 3, pages: 600 },
      { year: 2025, books: 1, pages: 150 },
    ])
  })

  it('filters totals and byYear to specified year while keeping all active years in years array', async () => {
    const stats = await statsService.getReadingStats(publicOwnerHandle, null, 2025)

    expect(stats.totals.books).toBe(1)
    expect(stats.totals.pages).toBe(150)
    expect(stats.byYear).toHaveLength(1)
    expect(stats.byYear).toEqual([{ year: 2025, books: 1, pages: 150 }])
    expect(stats.years).toEqual([2024, 2025])
  })

  it('counts private logs for the owner but hides them from anonymous and other members', async () => {
    const anonStats = await statsService.getReadingStats(publicOwnerHandle, null, null)
    expect(anonStats.totals.books).toBe(4)

    const otherStats = await statsService.getReadingStats(publicOwnerHandle, { id: otherMemberId }, null)
    expect(otherStats.totals.books).toBe(4)

    const ownerStats = await statsService.getReadingStats(publicOwnerHandle, { id: publicOwnerId }, null)
    expect(ownerStats.totals.books).toBe(5)
    expect(ownerStats.totals.pages).toBe(870)
  })

  it('never counts unfinished logs even for the owner', async () => {
    const ownerStats = await statsService.getReadingStats(publicOwnerHandle, { id: publicOwnerId }, null)
    expect(ownerStats.totals.books).toBe(5)
  })

  it('blocks private profiles with 404 for anonymous and other members while allowing owner with 200', async () => {
    let anonError: unknown
    try {
      await statsService.getReadingStats(privateOwnerHandle, null, null)
    } catch (err) {
      anonError = err
    }
    expect(anonError).toBeDefined()
    const aErr = asError(anonError)
    expect(aErr.statusCode).toBe(404)
    expect(aErr.data?.error).toBe('nao_encontrado')

    let otherError: unknown
    try {
      await statsService.getReadingStats(privateOwnerHandle, { id: otherMemberId }, null)
    } catch (err) {
      otherError = err
    }
    expect(otherError).toBeDefined()
    const oErr = asError(otherError)
    expect(oErr.statusCode).toBe(404)
    expect(oErr.data?.error).toBe('nao_encontrado')

    const ownerStats = await statsService.getReadingStats(privateOwnerHandle, { id: privateOwnerId }, null)
    expect(ownerStats.user.handle).toBe(privateOwnerHandle)
    expect(ownerStats.totals.books).toBe(1)
  })

  it('returns 404 with error nao_encontrado for unknown handle', async () => {
    let unknownError: unknown
    try {
      await statsService.getReadingStats(`nonexistent_${Date.now()}`, null, null)
    } catch (err) {
      unknownError = err
    }
    expect(unknownError).toBeDefined()
    const err = asError(unknownError)
    expect(err.statusCode).toBe(404)
    expect(err.data?.error).toBe('nao_encontrado')
  })

  it('counts 1 for country and 1 for each author on a work with two authors from same country', async () => {
    const stats = await statsService.getReadingStats(coAuthorOwnerHandle, null, null)

    expect(stats.totals.books).toBe(1)
    expect(stats.totals.countries).toBe(1)
    expect(stats.totals.authors).toBe(2)

    const france = stats.countries.find((c) => c.label === 'França')
    expect(france).toBeDefined()
    expect(france?.count).toBe(1)

    const author1 = stats.authors.find((a) => a.label === coAuthor1Name)
    const author2 = stats.authors.find((a) => a.label === coAuthor2Name)
    expect(author1?.count).toBe(1)
    expect(author2?.count).toBe(1)
  })
})
