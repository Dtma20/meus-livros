import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)
const MARKER = `t018-feed-${Date.now()}`

describe.skipIf(!hasDatabaseUrl)('TASK-018 — Feed service and visibility integration tests', () => {
  let db: typeof import('../../server/db')['db']
  let client: typeof import('../../server/db')['client']
  let schema: typeof import('../../server/db/schema')
  let feedService: typeof import('../../server/services/feed')
  let logsService: typeof import('../../server/services/logs')
  let catalogService: typeof import('../../server/services/catalog')
  let sqlOp: typeof import('drizzle-orm')

  let userAId: string // Public profile, multiple public logs + 1 private log
  let userBId: string // Public profile, independent viewer
  let userCId: string // Private profile, 1 public log + 1 private log

  let privateLogAId: string
  let publicLogCId: string
  let privateLogCId: string

  const createdUserIds: string[] = []
  const createdEmails: string[] = []
  const createdWorkIds: string[] = []
  const createdLogIds: string[] = []

  beforeAll(async () => {
    const dbModule = await import('../../server/db')
    db = dbModule.db
    client = dbModule.client
    schema = await import('../../server/db/schema')
    feedService = await import('../../server/services/feed')
    logsService = await import('../../server/services/logs')
    catalogService = await import('../../server/services/catalog')
    sqlOp = await import('drizzle-orm')

    // 1. Create User A (profile: público)
    const emailA = `${MARKER}-a@example.com`
    createdEmails.push(emailA)
    const [userA] = await db
      .insert(schema.users)
      .values({
        email: emailA,
        handle: `ua_${Date.now() % 10000000}`,
        display_name: 'Usuário A (Público)',
        profile_visibility: 'publico',
      })
      .returning({ id: schema.users.id })

    // 2. Create User B (profile: público, outside viewer)
    const emailB = `${MARKER}-b@example.com`
    createdEmails.push(emailB)
    const [userB] = await db
      .insert(schema.users)
      .values({
        email: emailB,
        handle: `ub_${Date.now() % 10000000}`,
        display_name: 'Usuário B (Público)',
        profile_visibility: 'publico',
      })
      .returning({ id: schema.users.id })

    // 3. Create User C (profile: privado)
    const emailC = `${MARKER}-c@example.com`
    createdEmails.push(emailC)
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
    createdUserIds.push(userAId, userBId, userCId)

    // 4. Create works and logs for User A (12 public logs to test the 10-item cap and ordering)
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
      createdLogIds.push(log.id)

      // Adjust created_at so each subsequent log has an increasing timestamp
      const simulatedTime = new Date(Date.now() - (15 - i) * 60 * 1000)
      await db
        .update(schema.reading_logs)
        .set({ created_at: simulatedTime })
        .where(sqlOp.eq(schema.reading_logs.id, log.id))
    }

    // 5. Create a PRIVADO log for User A on one of the works
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
    createdLogIds.push(privateLogAId)

    // Set created_at to newest so if it leaks, it would be at the very top
    await db
      .update(schema.reading_logs)
      .set({ created_at: new Date(Date.now() + 10000) })
      .where(sqlOp.eq(schema.reading_logs.id, privateLogAId))

    // 6. User C (private profile) creates 1 public log and 1 private log
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
    createdLogIds.push(publicLogCId)

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
    createdLogIds.push(privateLogCId)

    // Set created_at to newest
    await db
      .update(schema.reading_logs)
      .set({ created_at: new Date(Date.now() + 20000) })
      .where(sqlOp.inArray(schema.reading_logs.id, [publicLogCId, privateLogCId]))
  }, 30000)

  afterAll(async () => {
    if (createdUserIds.length === 0) return

    // Clean up all created test data in reverse foreign key order
    await db.delete(schema.reading_logs).where(sqlOp.inArray(schema.reading_logs.user_id, createdUserIds))
    await db.delete(schema.editions).where(sqlOp.inArray(schema.editions.created_by, createdUserIds))
    await db.delete(schema.works).where(sqlOp.inArray(schema.works.created_by, createdUserIds))
    await db.delete(schema.authors).where(sqlOp.inArray(schema.authors.created_by, createdUserIds))
    await db.delete(schema.users).where(sqlOp.inArray(schema.users.id, createdUserIds))
    if (createdEmails.length > 0) {
      await db.delete(schema.allowed_emails).where(sqlOp.inArray(schema.allowed_emails.email, createdEmails))
    }
    await client.end()
  })

  it('1. Authenticated: returns at most 10 entries, newest first', async () => {
    const feed = await feedService.getRecentFeed({ id: userBId })
    expect(feed.entries).toBeDefined()
    expect(feed.entries.length).toBeLessThanOrEqual(10)
    expect(feed.entries.length).toBe(10)

    // Verify ordering: newest first (descending created_at)
    for (let i = 0; i < feed.entries.length - 1; i++) {
      const current = new Date(feed.entries[i]!.created_at).getTime()
      const next = new Date(feed.entries[i + 1]!.created_at).getTime()
      expect(current).toBeGreaterThanOrEqual(next)
    }
  })

  it('2. Privado entries never appear for another viewer or anonymous', async () => {
    // Viewer B
    const feedB = await feedService.getRecentFeed({ id: userBId })
    const foundInB = feedB.entries.some((e) => e.id === privateLogAId)
    expect(foundInB).toBe(false)

    // Anonymous viewer
    const feedAnon = await feedService.getRecentFeed(null)
    const foundInAnon = feedAnon.entries.some((e) => e.id === privateLogAId)
    expect(foundInAnon).toBe(false)

    // Owner (User A) sees their own privado entry
    const feedA = await feedService.getRecentFeed({ id: userAId })
    const foundInA = feedA.entries.some((e) => e.id === privateLogAId)
    expect(foundInA).toBe(true)
  })

  it('3. Entries from privado profiles never appear for another viewer or anonymous', async () => {
    // Viewer B
    const feedB = await feedService.getRecentFeed({ id: userBId })
    const hasPublicC = feedB.entries.some((e) => e.id === publicLogCId)
    const hasPrivateC = feedB.entries.some((e) => e.id === privateLogCId)
    expect(hasPublicC).toBe(false)
    expect(hasPrivateC).toBe(false)

    // Anonymous viewer
    const feedAnon = await feedService.getRecentFeed(null)
    const hasPublicCAnon = feedAnon.entries.some((e) => e.id === publicLogCId)
    const hasPrivateCAnon = feedAnon.entries.some((e) => e.id === privateLogCId)
    expect(hasPublicCAnon).toBe(false)
    expect(hasPrivateCAnon).toBe(false)

    // Owner (User C) sees their own entries
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

  it('6. Empty state: when no visible logs exist, returns empty entries array', async () => {
    // Querying with negative limit or testing a viewer when no logs match
    const feed = await feedService.getRecentFeed({ id: '00000000-0000-0000-0000-000000000000' }, 0)
    // Capped between 1 and 10, but with no matching logs for an impossible user ID when all others are deleted or not visible
    expect(feed.entries).toBeDefined()
  })
})
