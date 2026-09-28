import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { removeFixtures, trackSetup } from './fixtures'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)
const MARKER = `zz-vis-${Date.now()}`

interface H3ErrorLike {
  statusCode?: number
  data?: { error?: string; message?: string }
}

function asError(caught: unknown): H3ErrorLike {
  return caught as H3ErrorLike
}

describe.skipIf(!hasDatabaseUrl)('TASK-017 - Visibility enforcement and tests', () => {
  let db: typeof import('../../server/db')['db']
  let client: typeof import('../../server/db')['client']
  let schema: typeof import('../../server/db/schema')
  let logsService: typeof import('../../server/services/logs')
  let catalogService: typeof import('../../server/services/catalog')
  let visibilityService: typeof import('../../server/services/visibility')
  let searchService: typeof import('../../server/services/search')
  let sqlOp: typeof import('drizzle-orm')

  let userAId: string
  let userBId: string
  let userCId: string

  let workId: string
  let logA1PrivateId: string
  let logC1PublicId: string

  const setup = trackSetup()

  beforeAll(() => setup.run(async () => {
    const dbModule = await import('../../server/db')
    db = dbModule.db
    client = dbModule.client
    schema = await import('../../server/db/schema')
    logsService = await import('../../server/services/logs')
    catalogService = await import('../../server/services/catalog')
    visibilityService = await import('../../server/services/visibility')
    searchService = await import('../../server/services/search')
    sqlOp = await import('drizzle-orm')

    const emailA = `${MARKER}-a@example.com`
    const rnd = Math.random().toString(36).slice(2, 8)
    const [userA] = await db
      .insert(schema.users)
      .values({
        email: emailA,
        handle: `ua_${rnd}`,
        display_name: 'Usuário A (Público)',
        profile_visibility: 'publico',
      })
      .returning({ id: schema.users.id })

    const emailB = `${MARKER}-b@example.com`
    const [userB] = await db
      .insert(schema.users)
      .values({
        email: emailB,
        handle: `ub_${rnd}`,
        display_name: 'Usuário B (Público)',
        profile_visibility: 'publico',
      })
      .returning({ id: schema.users.id })

    const emailC = `${MARKER}-c@example.com`
    const [userC] = await db
      .insert(schema.users)
      .values({
        email: emailC,
        handle: `uc_${rnd}`,
        display_name: 'Usuário C (Privado)',
        profile_visibility: 'privado',
      })
      .returning({ id: schema.users.id })

    if (!userA || !userB || !userC) {
      throw new Error('Falha ao criar usuários para testes de visibilidade.')
    }

    userAId = userA.id
    userBId = userB.id
    userCId = userC.id

    const createdWork = await catalogService.createWork(
      {
        title: `${MARKER} Obra para Visibilidade`,
        authors: [{ name: `${MARKER} Autor Visibilidade` }],
        genre_ids: [],
        edition: {
          publisher: 'Editora Visibilidade',
        },
      },
      userAId,
      { skipRateLimit: true },
    )
    workId = createdWork.id

    const logA1 = await logsService.createLog(
      {
        work_id: workId,
        rating: 3.0,
        review: 'Resenha privada do Usuário A',
        finished_on: '2026-03-01',
        finished_precision: 'dia',
        visibility: 'privado',
      },
      userAId,
      { skipRateLimit: true },
    )
    logA1PrivateId = logA1.id

    await logsService.createLog(
      {
        work_id: workId,
        rating: 5.0,
        review: 'Resenha pública do Usuário A',
        finished_on: '2026-03-05',
        finished_precision: 'dia',
        visibility: 'publico',
      },
      userAId,
      { skipRateLimit: true },
    )

    const logC1 = await logsService.createLog(
      {
        work_id: workId,
        rating: 4.0,
        review: 'Resenha pública do Usuário C em perfil privado',
        finished_on: '2026-03-10',
        finished_precision: 'dia',
        visibility: 'publico',
      },
      userCId,
      { skipRateLimit: true },
    )
    logC1PublicId = logC1.id

    await logsService.createLog(
      {
        work_id: workId,
        rating: 2.0,
        review: 'Resenha privada do Usuário C em perfil privado',
        finished_on: '2026-03-12',
        finished_precision: 'dia',
        visibility: 'privado',
      },
      userCId,
      { skipRateLimit: true },
    )
  }))

  afterAll(async () => {
    await setup.settled()
    try {
      await removeFixtures(MARKER)
    } finally {
      await client?.end()
    }
  })

  it('1. Owner sees own privado entry', async () => {
    const log = await logsService.getLogById(logA1PrivateId, { id: userAId })
    expect(log).toBeDefined()
    expect(log.id).toBe(logA1PrivateId)
    expect(log.visibility).toBe('privado')
    expect(log.review).toBe('Resenha privada do Usuário A')
    expect(log.rating).toBe(3.0)
  }, 20000)

  it('2. Second user does not see User A privado entry (returns 404, never 403)', async () => {
    let caught: unknown
    try {
      await logsService.getLogById(logA1PrivateId, { id: userBId })
    } catch (err) {
      caught = err
    }

    const err = asError(caught)
    expect(err.statusCode).toBe(404)
    expect(err.statusCode).not.toBe(403)
    expect(err.data?.error).toBe('nao_encontrado')
  }, 20000)

  it('3. Anonymous does not see User A privado entry (returns 404, never 403)', async () => {
    let caught: unknown
    try {
      await logsService.getLogById(logA1PrivateId, null)
    } catch (err) {
      caught = err
    }

    const err = asError(caught)
    expect(err.statusCode).toBe(404)
    expect(err.statusCode).not.toBe(403)
    expect(err.data?.error).toBe('nao_encontrado')
  }, 20000)

  it('4. Privado profile hides público entries: owner sees it, second user and anonymous get 404', async () => {

    const ownerLog = await logsService.getLogById(logC1PublicId, { id: userCId })
    expect(ownerLog).toBeDefined()
    expect(ownerLog.id).toBe(logC1PublicId)
    expect(ownerLog.visibility).toBe('publico')
    expect(ownerLog.user.profile_visibility).toBe('privado')

    let caughtB: unknown
    try {
      await logsService.getLogById(logC1PublicId, { id: userBId })
    } catch (err) {
      caughtB = err
    }
    const errB = asError(caughtB)
    expect(errB.statusCode).toBe(404)
    expect(errB.statusCode).not.toBe(403)
    expect(errB.data?.error).toBe('nao_encontrado')

    let caughtAnon: unknown
    try {
      await logsService.getLogById(logC1PublicId, null)
    } catch (err) {
      caughtAnon = err
    }
    const errAnon = asError(caughtAnon)
    expect(errAnon.statusCode).toBe(404)
    expect(errAnon.statusCode).not.toBe(403)
    expect(errAnon.data?.error).toBe('nao_encontrado')
  }, 20000)

  it('5. Aggregates exclude invisible entries: counts and averages do not leak existence', async () => {

    const [ownerStats] = await db
      .select({
        count: sqlOp.sql<number>`count(*)::int`,
        avgRating: sqlOp.sql<string | null>`round(avg(${schema.reading_logs.rating}::numeric), 2)::text`,
      })
      .from(schema.reading_logs)
      .innerJoin(schema.users, sqlOp.eq(schema.users.id, schema.reading_logs.user_id))
      .where(
        sqlOp.and(
          sqlOp.eq(schema.reading_logs.work_id, workId),
          sqlOp.eq(schema.reading_logs.user_id, userAId),
          visibilityService.visibleLogs({ id: userAId }),
        ),
      )
    if (!ownerStats) throw new Error("ownerStats ausente")
    expect(ownerStats.count).toBe(2)
    expect(Number(ownerStats.avgRating)).toBe(4.0)

    const [viewerBStats] = await db
      .select({
        count: sqlOp.sql<number>`count(*)::int`,
        avgRating: sqlOp.sql<string | null>`round(avg(${schema.reading_logs.rating}::numeric), 2)::text`,
      })
      .from(schema.reading_logs)
      .innerJoin(schema.users, sqlOp.eq(schema.users.id, schema.reading_logs.user_id))
      .where(
        sqlOp.and(
          sqlOp.eq(schema.reading_logs.work_id, workId),
          sqlOp.eq(schema.reading_logs.user_id, userAId),
          visibilityService.visibleLogs({ id: userBId }),
        ),
      )
    if (!viewerBStats) throw new Error("viewerBStats ausente")
    expect(viewerBStats.count).toBe(1)
    expect(Number(viewerBStats.avgRating)).toBe(5.0)

    const [anonStats] = await db
      .select({
        count: sqlOp.sql<number>`count(*)::int`,
        avgRating: sqlOp.sql<string | null>`round(avg(${schema.reading_logs.rating}::numeric), 2)::text`,
      })
      .from(schema.reading_logs)
      .innerJoin(schema.users, sqlOp.eq(schema.users.id, schema.reading_logs.user_id))
      .where(
        sqlOp.and(
          sqlOp.eq(schema.reading_logs.work_id, workId),
          sqlOp.eq(schema.reading_logs.user_id, userAId),
          visibilityService.visibleLogs(null),
        ),
      )
    if (!anonStats) throw new Error("anonStats ausente")
    expect(anonStats.count).toBe(1)
    expect(Number(anonStats.avgRating)).toBe(5.0)

    const [ownerCStats] = await db
      .select({ count: sqlOp.sql<number>`count(*)::int` })
      .from(schema.reading_logs)
      .innerJoin(schema.users, sqlOp.eq(schema.users.id, schema.reading_logs.user_id))
      .where(
        sqlOp.and(
          sqlOp.eq(schema.reading_logs.user_id, userCId),
          visibilityService.visibleLogs({ id: userCId }),
        ),
      )
    if (!ownerCStats) throw new Error("ownerCStats ausente")
    expect(ownerCStats.count).toBe(2)

    const [viewerBForC] = await db
      .select({ count: sqlOp.sql<number>`count(*)::int` })
      .from(schema.reading_logs)
      .innerJoin(schema.users, sqlOp.eq(schema.users.id, schema.reading_logs.user_id))
      .where(
        sqlOp.and(
          sqlOp.eq(schema.reading_logs.user_id, userCId),
          visibilityService.visibleLogs({ id: userBId }),
        ),
      )
    if (!viewerBForC) throw new Error("viewerBForC ausente")
    expect(viewerBForC.count).toBe(0)

    const [anonForC] = await db
      .select({ count: sqlOp.sql<number>`count(*)::int` })
      .from(schema.reading_logs)
      .innerJoin(schema.users, sqlOp.eq(schema.users.id, schema.reading_logs.user_id))
      .where(
        sqlOp.and(
          sqlOp.eq(schema.reading_logs.user_id, userCId),
          visibilityService.visibleLogs(null),
        ),
      )
    if (!anonForC) throw new Error("anonForC ausente")
    expect(anonForC.count).toBe(0)
  }, 20000)

  it('6. Non-owner receives 404 (never 403) on update and delete attempts', async () => {

    let caughtUpdate: unknown
    try {
      await logsService.updateLog(logA1PrivateId, { rating: 1.0 }, userBId)
    } catch (err) {
      caughtUpdate = err
    }
    const errUpdate = asError(caughtUpdate)
    expect(errUpdate.statusCode).toBe(404)
    expect(errUpdate.statusCode).not.toBe(403)
    expect(errUpdate.data?.error).toBe('nao_encontrado')

    let caughtDelete: unknown
    try {
      await logsService.deleteLog(logA1PrivateId, userBId)
    } catch (err) {
      caughtDelete = err
    }
    const errDelete = asError(caughtDelete)
    expect(errDelete.statusCode).toBe(404)
    expect(errDelete.statusCode).not.toBe(403)
    expect(errDelete.data?.error).toBe('nao_encontrado')

    const nonExistentId = '00000000-0000-0000-0000-000000000000'
    let caughtNotFound: unknown
    try {
      await logsService.getLogById(nonExistentId, { id: userAId })
    } catch (err) {
      caughtNotFound = err
    }
    const errNotFound = asError(caughtNotFound)
    expect(errNotFound.statusCode).toBe(404)
    expect(errNotFound.statusCode).not.toBe(403)
  }, 20000)
  it('7. search log_count counts only visible logs', async () => {

    const term = MARKER.slice(0, 20)

    const anon = (await searchService.searchWorks(term, null)).find((w) => w.id === workId)
    const owner = (await searchService.searchWorks(term, { id: userAId })).find((w) => w.id === workId)

    if (!anon || !owner) throw new Error('A obra de teste não apareceu na busca.')

    expect(anon.log_count).toBe(1)

    expect(owner.log_count).toBe(2)
  }, 20000)
})
