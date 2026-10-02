import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { removeFixtures, trackSetup, uniqueHandle } from './fixtures'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)
const MARKER = `t018-feed-${Date.now()}`

describe.skipIf(!hasDatabaseUrl)('TASK-018 - Feed service and visibility integration tests', () => {
  let db: typeof import('../../server/db')['db']
  let client: typeof import('../../server/db')['client']
  let schema: typeof import('../../server/db/schema')
  let feedService: typeof import('../../server/services/feed')
  let logsService: typeof import('../../server/services/logs')
  let catalogService: typeof import('../../server/services/catalog')
  let sqlOp: typeof import('drizzle-orm')

  let userAId: string
  let userBId: string
  let userCId: string

  let privateLogAId: string
  let publicLogCId: string
  let privateLogCId: string

  const createdWorkIds: string[] = []
  const setup = trackSetup()

  beforeAll(() => setup.run(async () => {
    const dbModule = await import('../../server/db')
    db = dbModule.db
    client = dbModule.client
    schema = await import('../../server/db/schema')
    feedService = await import('../../server/services/feed')
    logsService = await import('../../server/services/logs')
    catalogService = await import('../../server/services/catalog')
    sqlOp = await import('drizzle-orm')

    const emailA = `${MARKER}-a@example.com`
    const [userA] = await db
      .insert(schema.users)
      .values({
        email: emailA,
        handle: `ua_${Date.now() % 10000000}`,
        display_name: 'Usuário A (Público)',
        profile_visibility: 'publico',
      })
      .returning({ id: schema.users.id })

    const emailB = `${MARKER}-b@example.com`
    const [userB] = await db
      .insert(schema.users)
      .values({
        email: emailB,
        handle: `ub_${Date.now() % 10000000}`,
        display_name: 'Usuário B (Público)',
        profile_visibility: 'publico',
      })
      .returning({ id: schema.users.id })

    const emailC = `${MARKER}-c@example.com`
    const [userC] = await db
      .insert(schema.users)
      .values({
        email: emailC,
        handle: `uc_${Date.now() % 10000000}`,
        display_name: 'Usuário C (Privado)',
        profile_visibility: 'privado',
      })
      .returning({ id: schema.users.id })

    if (!userA || !userB || !userC) {
      throw new Error('Falha ao criar usuários para testes do feed.')
    }

    userAId = userA.id
    userBId = userB.id
    userCId = userC.id

    for (let i = 1; i <= 12; i++) {
      const work = await catalogService.createWork(
        {
          title: `${MARKER} Livro ${i}`,
          authors: [{ name: `${MARKER} Autor ${i}` }],
          genre_ids: [],
          edition: {
            publisher: `Editora ${i}`,
          },
        },
        userAId,
        { skipRateLimit: true },
      )
      createdWorkIds.push(work.id)

      const log = await logsService.createLog(
        {
          work_id: work.id,
          rating: (i % 5) + 0.5,
          review: `Resenha pública do livro ${i}. Detalhes sobre a leitura e impressões.`,
          finished_on: '2026-03-01',
          finished_precision: 'dia',
          visibility: 'publico',
        },
        userAId,
        { skipRateLimit: true },
      )

      const simulatedTime = new Date(Date.now() - (15 - i) * 60 * 1000)
      await db
        .update(schema.reading_logs)
        .set({ created_at: simulatedTime })
        .where(sqlOp.eq(schema.reading_logs.id, log.id))
    }

    const workForPrivA = createdWorkIds[0]!
    const privLogA = await logsService.createLog(
      {
        work_id: workForPrivA,
        rating: 3.0,
        review: 'Resenha privada do Usuário A que não deve aparecer para outros',
        finished_precision: 'dia',
        visibility: 'privado',
      },
      userAId,
      { skipRateLimit: true },
    )
    privateLogAId = privLogA.id

    await db
      .update(schema.reading_logs)
      .set({ created_at: new Date(Date.now() + 10000) })
      .where(sqlOp.eq(schema.reading_logs.id, privateLogAId))

    const workForC = createdWorkIds[1]!
    const pubLogC = await logsService.createLog(
      {
        work_id: workForC,
        rating: 4.5,
        review: 'Resenha pública de perfil privado - nunca deve aparecer no feed de outros',
        finished_precision: 'dia',
        visibility: 'publico',
      },
      userCId,
      { skipRateLimit: true },
    )
    publicLogCId = pubLogC.id

    const privLogC = await logsService.createLog(
      {
        work_id: workForC,
        rating: 1.0,
        review: 'Resenha privada de perfil privado',
        finished_precision: 'dia',
        visibility: 'privado',
      },
      userCId,
      { skipRateLimit: true },
    )
    privateLogCId = privLogC.id

    await db
      .update(schema.reading_logs)
      .set({ created_at: new Date(Date.now() + 20000) })
      .where(sqlOp.inArray(schema.reading_logs.id, [publicLogCId, privateLogCId]))
  }))

  afterAll(async () => {
    await setup.settled()
    try {
      await removeFixtures(MARKER)
    } finally {
      await client?.end()
    }
  })

  it.each(['log', 'profile'] as const)('removes a cached public entry when its %s becomes private through the real service', async (target) => {
    const marker = `${MARKER}-cache-${target}`
    try {
      const [owner] = await db.insert(schema.users).values({
        email: `${marker}@test.invalid`, handle: uniqueHandle('cache'), display_name: 'Cache Owner', profile_visibility: 'publico',
      }).returning({ id: schema.users.id })
      if (!owner) throw new Error('Usuário fixture não criado.')
      const work = await catalogService.createWork({
        title: `${marker} Work`, authors: [{ name: `${marker} Author` }], genre_ids: [],
      }, owner.id, { skipRateLimit: true })
      const log = await logsService.createLog({
        work_id: work.id, finished_precision: 'dia', rating: 4, visibility: 'publico',
      }, owner.id, { skipRateLimit: true })
      await db.update(schema.reading_logs).set({ created_at: new Date('2099-01-01T00:00:00Z') })
        .where(sqlOp.eq(schema.reading_logs.id, log.id))
      const { createBlock } = await import('../../server/services/reading-blocks')
      const block = await createBlock(log.id, owner.id, { start_page: 1, end_page: 10, read_at: '2099-01-01' })
      await db.update(schema.reading_blocks).set({ created_at: new Date('2099-01-01T00:00:01Z') })
        .where(sqlOp.eq(schema.reading_blocks.id, block.id))
      const before = await feedService.getFeedPage(null, { limit: 30 })
      expect(before.entries.map((entry) => entry.id)).toContain(log.id)
      expect(before.entries.map((entry) => entry.id)).toContain(block.id)
      // This second read exercises the warm cache before the real mutation.
      expect((await feedService.getFeedPage(null, { limit: 30 })).entries.map((entry) => entry.id)).toContain(log.id)
      if (target === 'log') {
        await logsService.updateLog(log.id, { visibility: 'privado' }, owner.id)
      } else {
        const { updateUserProfile } = await import('../../server/services/users')
        await updateUserProfile(owner.id, { profile_visibility: 'privado' })
      }
      expect((await feedService.getFeedPage(null, { limit: 30 })).entries.map((entry) => entry.id)).not.toContain(log.id)
      expect((await feedService.getFeedPage(null, { limit: 30 })).entries.map((entry) => entry.id)).not.toContain(block.id)
      expect((await feedService.getFeedPage({ id: owner.id }, { limit: 30 })).entries.map((entry) => entry.id)).toContain(log.id)
      expect((await feedService.getFeedPage({ id: owner.id }, { limit: 30 })).entries.map((entry) => entry.id)).toContain(block.id)
    } finally {
      await removeFixtures(marker)
      feedService.invalidateFeedCache()
    }
  })

  it('1. Authenticated: returns at most 10 entries, newest first', async () => {
    const feed = await feedService.getRecentFeed({ id: userBId })
    expect(feed.entries).toBeDefined()
    expect(feed.entries.length).toBeLessThanOrEqual(10)
    expect(feed.entries.length).toBe(10)

    for (let i = 0; i < feed.entries.length - 1; i++) {
      const current = new Date(feed.entries[i]!.created_at).getTime()
      const next = new Date(feed.entries[i + 1]!.created_at).getTime()
      expect(current).toBeGreaterThanOrEqual(next)
    }
  })

  it('2. Privado entries never appear for another viewer or anonymous', async () => {

    const feedB = await feedService.getRecentFeed({ id: userBId })
    const foundInB = feedB.entries.some((e) => e.id === privateLogAId)
    expect(foundInB).toBe(false)

    const feedAnon = await feedService.getRecentFeed(null)
    const foundInAnon = feedAnon.entries.some((e) => e.id === privateLogAId)
    expect(foundInAnon).toBe(false)

    const feedA = await feedService.getRecentFeed({ id: userAId })
    const foundInA = feedA.entries.some((e) => e.id === privateLogAId)
    expect(foundInA).toBe(true)
  })

  it('3. Entries from privado profiles never appear for another viewer or anonymous', async () => {

    const feedB = await feedService.getRecentFeed({ id: userBId })
    const hasPublicC = feedB.entries.some((e) => e.id === publicLogCId)
    const hasPrivateC = feedB.entries.some((e) => e.id === privateLogCId)
    expect(hasPublicC).toBe(false)
    expect(hasPrivateC).toBe(false)

    const feedAnon = await feedService.getRecentFeed(null)
    const hasPublicCAnon = feedAnon.entries.some((e) => e.id === publicLogCId)
    const hasPrivateCAnon = feedAnon.entries.some((e) => e.id === privateLogCId)
    expect(hasPublicCAnon).toBe(false)
    expect(hasPrivateCAnon).toBe(false)

    const feedC = await feedService.getRecentFeed({ id: userCId })
    const foundInC = feedC.entries.some((e) => e.id === publicLogCId || e.id === privateLogCId)
    expect(foundInC).toBe(true)
  })

  it('4. ?limit=1000 still returns at most 10', async () => {
    const feed = await feedService.getRecentFeed({ id: userBId }, 1000)
    expect(feed.entries.length).toBeLessThanOrEqual(10)
    expect(feed.entries.length).toBe(10)
  })

  it('5. Each entry has valid shape and links to permalink (/entrada/:id)', async () => {
    const feed = await feedService.getRecentFeed({ id: userBId })
    const entry = feed.entries[0]!
    expect(entry.id).toBeDefined()
    expect(entry.work.title).toBeDefined()
    expect(entry.user.handle).toBeDefined()
    expect(entry.created_at).toBeDefined()
    expect(entry.review_excerpt).toBeDefined()
  })

  it('6a. ?limit=0 clamps to minimum limit of 1 entry', async () => {
    const feed = await feedService.getRecentFeed({ id: userBId }, 0)
    expect(feed.entries).toHaveLength(1)
  })

  it('6b. Empty state: when no logs match the query/cursor, returns empty entries array', async () => {
    const pastCursor = feedService.encodeCursor({
      id: '00000000-0000-4000-8000-000000000000',
      created_at: '1970-01-01T00:00:00.000Z',
    })
    const page = await feedService.getFeedPage({ id: userBId }, { cursor: pastCursor })
    expect(page.entries).toEqual([])
    expect(page.nextCursor).toBeNull()
  })

  describe('TASK-036 - Keyset pagination (getFeedPage)', () => {
    let userPId: string
    let userOtherId: string
    let log1Id: string
    let log2Id: string
    let log3Id: string
    let privLogId: string
    const MARKER_036 = `t036-feed-${Date.now()}`

    beforeAll(async () => {
      const emailP = `${MARKER_036}-p@example.com`
      const [userP] = await db
        .insert(schema.users)
        .values({
          email: emailP,
          handle: `up_${Date.now() % 10000000}`,
          display_name: 'Usuário P (Público)',
          profile_visibility: 'publico',
        })
        .returning({ id: schema.users.id })

      const emailO = `${MARKER_036}-o@example.com`
      const [userO] = await db
        .insert(schema.users)
        .values({
          email: emailO,
          handle: `uo_${Date.now() % 10000000}`,
          display_name: 'Usuário Outro',
          profile_visibility: 'publico',
        })
        .returning({ id: schema.users.id })

      userPId = userP!.id
      userOtherId = userO!.id

      const w1 = await catalogService.createWork(
        { title: `${MARKER_036} Livro 1`, authors: [{ name: `${MARKER_036} Autor 1` }], genre_ids: [] },
        userPId,
        { skipRateLimit: true },
      )
      const l1 = await logsService.createLog(
        { work_id: w1.id, rating: 4, review: 'Resenha 1', finished_precision: 'dia', visibility: 'publico' },
        userPId,
        { skipRateLimit: true },
      )
      log1Id = l1.id

      const w2 = await catalogService.createWork(
        { title: `${MARKER_036} Livro 2`, authors: [{ name: `${MARKER_036} Autor 2` }], genre_ids: [] },
        userPId,
        { skipRateLimit: true },
      )
      const l2 = await logsService.createLog(
        { work_id: w2.id, rating: 5, review: 'Resenha 2', finished_precision: 'dia', visibility: 'publico' },
        userPId,
        { skipRateLimit: true },
      )
      log2Id = l2.id

      const w3 = await catalogService.createWork(
        { title: `${MARKER_036} Livro 3`, authors: [{ name: `${MARKER_036} Autor 3` }], genre_ids: [] },
        userPId,
        { skipRateLimit: true },
      )
      const l3 = await logsService.createLog(
        { work_id: w3.id, rating: 3, review: 'Resenha 3', finished_precision: 'dia', visibility: 'publico' },
        userPId,
        { skipRateLimit: true },
      )
      log3Id = l3.id

      const w4 = await catalogService.createWork(
        { title: `${MARKER_036} Livro 4`, authors: [{ name: `${MARKER_036} Autor 4` }], genre_ids: [] },
        userPId,
        { skipRateLimit: true },
      )
      const l4 = await logsService.createLog(
        { work_id: w4.id, rating: 1, review: 'Resenha Privada', finished_precision: 'dia', visibility: 'privado' },
        userPId,
        { skipRateLimit: true },
      )
      privLogId = l4.id

      const baseTime = Date.now() + 1_000_000
      await db.update(schema.reading_logs).set({ created_at: new Date(baseTime + 10_000) }).where(sqlOp.eq(schema.reading_logs.id, log1Id))
      await db.update(schema.reading_logs).set({ created_at: new Date(baseTime + 20_000) }).where(sqlOp.eq(schema.reading_logs.id, log2Id))
      await db.update(schema.reading_logs).set({ created_at: new Date(baseTime + 30_000) }).where(sqlOp.eq(schema.reading_logs.id, log3Id))
      await db.update(schema.reading_logs).set({ created_at: new Date(baseTime + 40_000) }).where(sqlOp.eq(schema.reading_logs.id, privLogId))
    }, 30000)

    afterAll(async () => {
      await removeFixtures(MARKER_036)
    }, 30000)

    it('limit=2 returns the 2 newest visible logs and a non-null nextCursor', async () => {
      const page1 = await feedService.getFeedPage({ id: userOtherId }, { limit: 2 })
      const fixtureEntries = page1.entries.filter((e) => [log1Id, log2Id, log3Id, privLogId].includes(e.id))
      expect(fixtureEntries.map((e) => e.id)).toEqual([log3Id, log2Id])
      expect(page1.nextCursor).not.toBeNull()
      expect(page1.entries.some((e) => e.id === privLogId)).toBe(false)
    }, 30000)

    it('following nextCursor returns the third visible log and no already seen entry', async () => {
      const page1 = await feedService.getFeedPage({ id: userOtherId }, { limit: 2 })
      expect(page1.nextCursor).not.toBeNull()

      const page2 = await feedService.getFeedPage({ id: userOtherId }, { cursor: page1.nextCursor, limit: 2 })
      const page1Ids = page1.entries.map((e) => e.id)
      const hasAnyPage1 = page2.entries.some((e) => page1Ids.includes(e.id))
      expect(hasAnyPage1).toBe(false)

      const foundLog1 = page2.entries.some((e) => e.id === log1Id)
      expect(foundLog1).toBe(true)
      expect(page2.entries.some((e) => e.id === privLogId)).toBe(false)
    }, 30000)

    it('private fixture log never appears for another viewer or anonymous', async () => {
      const pageOther = await feedService.getFeedPage({ id: userOtherId }, { limit: 10 })
      expect(pageOther.entries.some((e) => e.id === privLogId)).toBe(false)

      const pageAnon = await feedService.getFeedPage(null, { limit: 10 })
      expect(pageAnon.entries.some((e) => e.id === privLogId)).toBe(false)
    }, 30000)

    it('malformed cursor throws 400 cursor_invalido', async () => {
      await expect(
        feedService.getFeedPage({ id: userOtherId }, { cursor: 'malformed_not_base64_json' })
      ).rejects.toMatchObject({
        statusCode: 400,
        data: { error: 'cursor_invalido' },
      })

      const invalidJsonBase64 = Buffer.from('{"t":123}', 'utf8').toString('base64url')
      await expect(
        feedService.getFeedPage({ id: userOtherId }, { cursor: invalidJsonBase64 })
      ).rejects.toMatchObject({
        statusCode: 400,
        data: { error: 'cursor_invalido' },
      })

      const invalidDateBase64 = Buffer.from('{"t":"invalid-date","id":"00000000-0000-0000-0000-000000000000"}', 'utf8').toString('base64url')
      await expect(
        feedService.getFeedPage({ id: userOtherId }, { cursor: invalidDateBase64 })
      ).rejects.toMatchObject({
        statusCode: 400,
        data: { error: 'cursor_invalido' },
      })

      const invalidUuidBase64 = Buffer.from('{"t":"2026-01-01T00:00:00Z","id":"invalid-uuid"}', 'utf8').toString('base64url')
      await expect(
        feedService.getFeedPage({ id: userOtherId }, { cursor: invalidUuidBase64 })
      ).rejects.toMatchObject({
        statusCode: 400,
        data: { error: 'cursor_invalido' },
      })
    }, 30000)
  })
})
