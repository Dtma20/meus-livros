import { and, eq, inArray, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { removeFixtures, trackSetup, uniqueHandle } from './fixtures'

const MARKER = `zz-comments-${Date.now()}`
const MISSING = '00000000-0000-4000-a000-000000000000'

describe('Comment conversations and authorization', () => {
  let db: typeof import('../../server/db')['db']
  let schema: typeof import('../../server/db/schema')
  let service: typeof import('../../server/services/comments')
  let ownerId: string
  let authorId: string
  let strangerId: string
  let privateOwnerId: string
  let logId: string
  let privateLogId: string
  let hiddenLogId: string
  let blankLogId: string
  let blockId: string
  let secondBlockId: string
  let wrongBlockId: string
  const setup = trackSetup()

  beforeAll(() => setup.run(async () => {
    db = (await import('../../server/db')).db
    schema = await import('../../server/db/schema')
    service = await import('../../server/services/comments')
    const userIds: string[] = []
    for (const name of ['owner', 'author', 'stranger', 'private']) {
      const [user] = await db.insert(schema.users).values({
        email: `${MARKER}-${name}@example.com`, handle: uniqueHandle('cm'), display_name: name,
        profile_visibility: name === 'private' ? 'privado' : 'publico',
      }).returning({ id: schema.users.id })
      if (!user) throw new Error('Missing fixture user')
      userIds.push(user.id)
    }
    ;[ownerId, authorId, strangerId, privateOwnerId] = userIds as [string, string, string, string]
    const [work] = await db.insert(schema.works).values({ title: MARKER, slug: MARKER }).returning()
    if (!work) throw new Error('Missing fixture work')
    const logs = await db.insert(schema.reading_logs).values([
      { user_id: ownerId, work_id: work.id, review: 'Resenha pública' },
      { user_id: ownerId, work_id: work.id, review: 'Privada', visibility: 'privado' },
      { user_id: privateOwnerId, work_id: work.id, review: 'Perfil privado' },
      { user_id: ownerId, work_id: work.id, review: ' \n\t ' },
    ]).returning({ id: schema.reading_logs.id })
    ;[logId, privateLogId, hiddenLogId, blankLogId] = logs.map((log) => log.id) as [string, string, string, string]
    const blocks = await db.insert(schema.reading_blocks).values([
      { log_id: logId, user_id: ownerId, start_page: 1, end_page: 10 },
      { log_id: logId, user_id: ownerId, start_page: 11, end_page: 20 },
      { log_id: blankLogId, user_id: ownerId, start_page: 1, end_page: 10 },
    ]).returning({ id: schema.reading_blocks.id })
    ;[blockId, secondBlockId, wrongBlockId] = blocks.map((block) => block.id) as [string, string, string]
  }))

  afterAll(async () => {
    await setup.settled()
    await removeFixtures(MARKER)
  })

  async function expectNotFound(action: () => Promise<unknown>) {
    await expect(action()).rejects.toMatchObject({ statusCode: 404, data: { error: 'nao_encontrado' } })
  }

  it('keeps the review and every reading block in separate conversations', async () => {
    const review = await service.createComment(logId, authorId, { body: 'Resenha' })
    const block = await service.createComment(logId, authorId, { body: 'Primeiro trecho', block_id: blockId })
    const second = await service.createComment(logId, authorId, { body: 'Segundo trecho', block_id: secondBlockId })
    expect((await service.getCommentsForLog(logId, null, { limit: 50 })).comments.map((c) => c.id)).toEqual([review.id])
    expect((await service.getCommentsForLog(logId, null, { block_id: blockId, limit: 50 })).comments.map((c) => c.id)).toEqual([block.id])
    expect((await service.getCommentsForLog(logId, null, { block_id: secondBlockId, limit: 50 })).comments.map((c) => c.id)).toEqual([second.id])
  })

  it('hides private logs and private profiles on both read and write', async () => {
    for (const target of [privateLogId, hiddenLogId, MISSING]) {
      await expectNotFound(() => service.getCommentsForLog(target, null, { limit: 50 }))
      await expectNotFound(() => service.getCommentsForLog(target, { id: authorId }, { limit: 50 }))
      await expectNotFound(() => service.createComment(target, authorId, { body: 'Sem acesso' }))
    }
    expect((await service.createComment(privateLogId, ownerId, { body: 'Dono' })).body).toBe('Dono')
    expect((await service.createComment(hiddenLogId, privateOwnerId, { body: 'Dono' })).body).toBe('Dono')
  })

  it('requires a nonblank review or a reading block that belongs to this log', async () => {
    await expectNotFound(() => service.createComment(blankLogId, ownerId, { body: 'Sem resenha' }))
    await expectNotFound(() => service.getCommentsForLog(blankLogId, null, { limit: 50 }))
    for (const target of [wrongBlockId, MISSING]) {
      await expectNotFound(() => service.createComment(logId, authorId, { body: 'Trecho errado', block_id: target }))
      await expectNotFound(() => service.getCommentsForLog(logId, null, { block_id: target, limit: 50 }))
    }
    expect((await service.createComment(blankLogId, authorId, { body: 'Trecho sem resenha', block_id: wrongBlockId })).block_id).toBe(wrongBlockId)
  })

  it('reports permissions and permits only the author or log owner to delete', async () => {
    const comment = await service.createComment(logId, authorId, { body: 'Remover', block_id: blockId })
    expect(comment.can_delete).toBe(true)
    expect(comment.created_at).toEqual(expect.stringMatching(/\.\d{6}Z$/))
    expect(comment.user).toEqual({ handle: expect.any(String), display_name: 'author' })
    for (const [viewer, canDelete] of [[null, false], [{ id: strangerId }, false], [{ id: ownerId }, true], [{ id: authorId }, true]] as const) {
      const result = await service.getCommentsForLog(logId, viewer, { block_id: blockId, limit: 50 })
      expect(result.comments.find((row) => row.id === comment.id)?.can_delete).toBe(canDelete)
    }
    await expectNotFound(() => service.deleteComment(logId, comment.id, strangerId))
    await expectNotFound(() => service.deleteComment(blankLogId, comment.id, ownerId))
    await service.deleteComment(logId, comment.id, authorId)
    await expectNotFound(() => service.deleteComment(logId, comment.id, authorId))
    const moderated = await service.createComment(logId, authorId, { body: 'Moderar', block_id: blockId })
    await service.deleteComment(logId, moderated.id, ownerId)
  })

  it('rechecks visibility before deleting even a comment owned by the viewer', async () => {
    const comment = await service.createComment(logId, authorId, { body: 'Ficou privado', block_id: blockId })
    await db.update(schema.reading_logs).set({ visibility: 'privado' }).where(eq(schema.reading_logs.id, logId))
    try {
      await expectNotFound(() => service.deleteComment(logId, comment.id, authorId))
      await service.deleteComment(logId, comment.id, ownerId)
    } finally {
      await db.update(schema.reading_logs).set({ visibility: 'publico' }).where(eq(schema.reading_logs.id, logId))
    }
  })

  it('paginates chronological UUID ties without rounding microsecond timestamps', async () => {
    const [block] = await db.insert(schema.reading_blocks).values({ log_id: logId, user_id: ownerId, start_page: 21, end_page: 30 }).returning()
    if (!block) throw new Error('Missing pagination block')
    const ids = ['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003']
    await db.insert(schema.comments).values(ids.map((id, index) => ({
      id, log_id: logId, block_id: block.id, user_id: authorId, body: `Página ${index}`,
      created_at: sql`'2026-10-01 10:00:00.123456+00'::timestamptz`,
    })))
    const first = await service.getCommentsForLog(logId, null, { block_id: block.id, limit: 2 })
    expect(first.comments.map((c) => c.id)).toEqual(ids.slice(0, 2))
    expect(first.comments[0]?.created_at).toBe('2026-10-01T10:00:00.123456Z')
    expect(first.nextCursor).toBeTruthy()
    const cursor = JSON.parse(first.nextCursor!)
    const second = await service.getCommentsForLog(logId, null, { block_id: block.id, limit: 2, cursor })
    expect(second.comments.map((c) => c.id)).toEqual(ids.slice(2))
    expect(second.nextCursor).toBeNull()
  })

  it('cascades block, log, and author deletions', async () => {
    const blockComment = await service.createComment(logId, authorId, { body: 'Excluir trecho', block_id: secondBlockId })
    await db.delete(schema.reading_blocks).where(eq(schema.reading_blocks.id, secondBlockId))
    expect(await db.select().from(schema.comments).where(eq(schema.comments.id, blockComment.id))).toHaveLength(0)
    const logComment = await service.createComment(privateLogId, ownerId, { body: 'Excluir registro' })
    await db.delete(schema.reading_logs).where(eq(schema.reading_logs.id, privateLogId))
    expect(await db.select().from(schema.comments).where(eq(schema.comments.id, logComment.id))).toHaveLength(0)
    const authorComment = await service.createComment(logId, strangerId, { body: 'Excluir autor' })
    await db.delete(schema.users).where(eq(schema.users.id, strangerId))
    expect(await db.select().from(schema.comments).where(eq(schema.comments.id, authorComment.id))).toHaveLength(0)
  })

  it('requires an explicit viewer and rejects invalid service input before storing it', async () => {
    await expect(service.getCommentsForLog(logId, undefined as never, { limit: 50 })).rejects.toThrow(TypeError)
    await expect(service.createComment(logId, authorId, { body: ' ' })).rejects.toMatchObject({ statusCode: 400 })
    expect(await db.select().from(schema.comments).where(and(eq(schema.comments.log_id, logId), inArray(schema.comments.body, ['', ' '])))).toHaveLength(0)
  })
})
