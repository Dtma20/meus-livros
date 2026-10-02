import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { removeFixtures, trackSetup, uniqueHandle } from './fixtures'

const marker = `feed-blocks-${Date.now()}`

describe('Feed reading block events', () => {
  let db: typeof import('../../server/db')['db']
  let client: typeof import('../../server/db')['client']
  let schema: typeof import('../../server/db/schema')
  let feed: typeof import('../../server/services/feed')
  let blocks: typeof import('../../server/services/reading-blocks')
  let ownerId: string
  let privateOwnerId: string
  let publicOwnerId: string
  let logId: string
  let privateLogId: string
  let privateProfileLogId: string
  let blockId: string
  let bareBlockId: string
  let privateBlockId: string
  let privateProfileBlockId: string
  const setup = trackSetup()

  beforeAll(() => setup.run(async () => {
    ;({ db, client } = await import('../../server/db'))
    schema = await import('../../server/db/schema')
    feed = await import('../../server/services/feed')
    blocks = await import('../../server/services/reading-blocks')
    const owners = await db.insert(schema.users).values([
      { email: `${marker}@test.invalid`, handle: uniqueHandle('fb'), display_name: 'Reader', profile_visibility: 'privado' },
      { email: `${marker}-private@test.invalid`, handle: uniqueHandle('fb'), display_name: 'Private reader', profile_visibility: 'privado' },
      { email: `${marker}-public@test.invalid`, handle: uniqueHandle('fb'), display_name: 'Public reader', profile_visibility: 'publico' },
    ]).returning({ id: schema.users.id })
    ownerId = owners[0]!.id
    privateOwnerId = owners[1]!.id
    publicOwnerId = owners[2]!.id
    const [work] = await db.insert(schema.works).values({ title: `${marker} book`, slug: marker, created_by: ownerId }).returning()
    const logs = await db.insert(schema.reading_logs).values([
      { id: '10000000-0000-4000-8000-000000000011', user_id: ownerId, work_id: work!.id, rating: '4.5', review: 'Parent review', visibility: 'publico', created_at: new Date('2188-01-01T12:00:00Z') },
      { user_id: publicOwnerId, work_id: work!.id, visibility: 'privado', created_at: new Date('2188-01-01T11:00:00Z') },
      { user_id: privateOwnerId, work_id: work!.id, visibility: 'publico', created_at: new Date('2188-01-01T11:00:00Z') },
    ]).returning()
    logId = logs[0]!.id
    privateLogId = logs[1]!.id
    privateProfileLogId = logs[2]!.id
    const created = await db.insert(schema.reading_blocks).values([
      { id: '10000000-0000-4000-8000-000000000012', log_id: logId, user_id: ownerId, start_page: 1, end_page: 20, comment: 'Block annotation', read_at: '2020-01-01', created_at: new Date('2188-01-01T12:00:00Z') },
      { id: '10000000-0000-4000-8000-000000000013', log_id: logId, user_id: ownerId, start_page: 21, end_page: 40, comment: null, read_at: '2020-01-02', created_at: new Date('2188-01-01T12:00:01Z') },
      { log_id: privateLogId, user_id: publicOwnerId, start_page: 1, end_page: 2, created_at: new Date('2188-01-01T11:00:02Z') },
      { log_id: privateProfileLogId, user_id: privateOwnerId, start_page: 1, end_page: 2, created_at: new Date('2188-01-01T11:00:02Z') },
    ]).returning()
    blockId = created[0]!.id
    bareBlockId = created[1]!.id
    privateBlockId = created[2]!.id
    privateProfileBlockId = created[3]!.id
    // Both events round to the same millisecond in JS. PostgreSQL must keep
    // their exact ordering and cursor, rather than reconstructing a Date.
    await db.update(schema.reading_logs).set({ created_at: sql`'2188-01-01T12:00:00.123456Z'::timestamptz` }).where(eq(schema.reading_logs.id, logId))
    await db.update(schema.reading_blocks).set({ created_at: sql`'2188-01-01T12:00:00.123456Z'::timestamptz` }).where(eq(schema.reading_blocks.id, blockId))
    await db.update(schema.reading_blocks).set({ created_at: sql`'2188-01-01T12:00:00.123457Z'::timestamptz` }).where(eq(schema.reading_blocks.id, bareBlockId))
  }))

  beforeEach(() => feed.invalidateFeedCache())
  afterAll(async () => {
    await setup.settled()
    try { await removeFixtures(marker) } finally { await client?.end() }
  })

  it('globally paginates blocks and logs by exact creation time and event UUID', async () => {
    const first = await feed.getFeedPage({ id: ownerId }, { limit: 1 })
    expect(first.entries.map(entry => entry.id)).toEqual([bareBlockId])
    expect(feed.decodeCursor(first.nextCursor!)).toEqual({ t: '2188-01-01T12:00:00.123457Z', id: bareBlockId })
    const second = await feed.getFeedPage({ id: ownerId }, { limit: 1, cursor: first.nextCursor })
    expect(second.entries.map(entry => entry.id)).toEqual([blockId])
    expect(feed.decodeCursor(second.nextCursor!)).toEqual({ t: '2188-01-01T12:00:00.123456Z', id: blockId })
    const third = await feed.getFeedPage({ id: ownerId }, { limit: 1, cursor: second.nextCursor })
    expect(third.entries.map(entry => entry.id)).toEqual([logId])
    const together = await feed.getFeedPage({ id: ownerId }, { limit: 3 })
    expect(together.entries.map(entry => entry.id)).toEqual([bareBlockId, blockId, logId])
    expect((await feed.getRecentFeed({ id: ownerId }, 2)).entries.map(entry => entry.id)).toEqual([bareBlockId, blockId])
  })

  it('publishes unannotated blocks and keeps their parent metadata separate', async () => {
    const page = await feed.getFeedPage({ id: ownerId }, { limit: 3 })
    expect(page.entries[0]).toMatchObject({
      id: bareBlockId, log_id: logId, kind: 'reading_block', rating: null, review_excerpt: null,
      block: { id: bareBlockId, start_page: 21, end_page: 40, comment: null, read_at: '2020-01-02' },
    })
    expect(page.entries[1]).toMatchObject({
      id: blockId, log_id: logId, kind: 'reading_block', rating: null, review_excerpt: 'Block annotation',
      block: { id: blockId, start_page: 1, end_page: 20, comment: 'Block annotation', read_at: '2020-01-01' },
    })
    expect(page.entries[2]).toMatchObject({ id: logId, log_id: logId, kind: 'reading_log', rating: 4.5, review_excerpt: 'Parent review', block: null })
  })

  it('hides blocks of private logs and profiles from outsiders but includes each owner', async () => {
    for (const viewer of [null, { id: '33333333-3333-4333-8333-333333333333' }]) {
      const ids = (await feed.getFeedPage(viewer, { limit: 10 })).entries.map(entry => entry.id)
      expect(ids).not.toContain(privateBlockId)
      expect(ids).not.toContain(privateProfileBlockId)
    }
    expect((await feed.getFeedPage({ id: publicOwnerId }, { limit: 10 })).entries.map(entry => entry.id)).toContain(privateBlockId)
    expect((await feed.getFeedPage({ id: privateOwnerId }, { limit: 10 })).entries.map(entry => entry.id)).toContain(privateProfileBlockId)
  })

  it('refreshes a warm block cache on edit without changing identity or publication time, then on delete', async () => {
    const before = (await feed.getFeedPage({ id: ownerId }, { limit: 3 })).entries.find(entry => entry.id === bareBlockId)!
    expect(before).toBeDefined()
    await blocks.updateBlock(bareBlockId, ownerId, { comment: 'Updated annotation', end_page: 45 })
    const after = (await feed.getFeedPage({ id: ownerId }, { limit: 3 })).entries.find(entry => entry.id === bareBlockId)!
    expect(after).toMatchObject({ id: bareBlockId, created_at: before.created_at, review_excerpt: 'Updated annotation', block: { end_page: 45 } })
    await blocks.deleteBlock(bareBlockId, ownerId)
    expect((await feed.getFeedPage({ id: ownerId }, { limit: 3 })).entries.map(entry => entry.id)).not.toContain(bareBlockId)
  })

})
