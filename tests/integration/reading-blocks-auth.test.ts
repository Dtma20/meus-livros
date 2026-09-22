import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isError } from 'h3'
import type { ReadingBlockInput, UpdateReadingBlockInput } from '../../shared/schemas/reading-block'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)
const MARKER = `zz-reading-blocks-auth-${Date.now()}`

describe.skipIf(!hasDatabaseUrl)('Reading blocks authorization integration tests', () => {
  let db: typeof import('../../server/db')['db']
  let client: typeof import('../../server/db')['client']
  let schema: typeof import('../../server/db/schema')
  let sqlOp: typeof import('drizzle-orm')
  let catalogService: typeof import('../../server/services/catalog')
  let logsService: typeof import('../../server/services/logs')
  let readingBlocksService: typeof import('../../server/services/reading-blocks')

  let userAId: string
  let userBId: string
  let logId: string
  let blockId: string

  beforeAll(async () => {
    const dbModule = await import('../../server/db')
    db = dbModule.db
    client = dbModule.client
    schema = await import('../../server/db/schema')
    sqlOp = await import('drizzle-orm')
    catalogService = await import('../../server/services/catalog')
    logsService = await import('../../server/services/logs')
    readingBlocksService = await import('../../server/services/reading-blocks')

    const [userA] = await db.insert(schema.users).values({
      email: `${MARKER}-a@example.com`,
      handle: `rba${Date.now()}`.slice(0, 20),
      display_name: 'Usuário A',
    }).returning({ id: schema.users.id })
    const [userB] = await db.insert(schema.users).values({
      email: `${MARKER}-b@example.com`,
      handle: `rbb${Date.now()}`.slice(0, 20),
      display_name: 'Usuário B',
    }).returning({ id: schema.users.id })

    if (!userA || !userB) throw new Error('Não foi possível criar usuários de teste.')
    userAId = userA.id
    userBId = userB.id

    const work = await catalogService.createWork({
      title: `${MARKER} Obra`,
      authors: [{ name: `${MARKER} Autor` }],
      genre_ids: [],
    }, userAId, { skipRateLimit: true })
    const log = await logsService.createLog({
      work_id: work.id,
      finished_on: '2026-09-20',
      finished_precision: 'dia',
      visibility: 'publico',
    }, userAId, { skipRateLimit: true })
    logId = log.id

    const blockInput: ReadingBlockInput = {
      start_page: 1,
      end_page: 10,
      read_at: '2026-09-20',
    }
    const block = await readingBlocksService.createBlock(logId, userAId, blockInput)
    blockId = block.id
  }, 30000)

  afterAll(async () => {
    if (!userAId && !userBId) return
    const userIds = [userAId, userBId].filter(Boolean)

    await db.delete(schema.reading_logs).where(sqlOp.inArray(schema.reading_logs.user_id, userIds))
    await db.delete(schema.editions).where(sqlOp.inArray(schema.editions.created_by, userIds))
    await db.delete(schema.works).where(sqlOp.inArray(schema.works.created_by, userIds))
    await db.delete(schema.authors).where(sqlOp.inArray(schema.authors.created_by, userIds))
    await db.delete(schema.users).where(sqlOp.inArray(schema.users.id, userIds))
    await client.end()
  })

  async function captureBody(action: () => Promise<unknown>): Promise<unknown> {
    try {
      await action()
    } catch (caught: unknown) {
      if (!isError(caught)) throw caught
      expect(caught.statusCode).toBe(404)
      return caught.data
    }
    throw new Error('A operação deveria falhar com 404.')
  }

  it('returns identical update bodies for foreign and nonexistent blocks', async () => {
    const input: UpdateReadingBlockInput = { comment: 'não deve salvar' }
    const foreignBody = await captureBody(() => readingBlocksService.updateBlock(blockId, userBId, input))
    const missingBody = await captureBody(() => readingBlocksService.updateBlock('00000000-0000-0000-0000-000000000000', userBId, input))

    expect(foreignBody).toEqual(missingBody)
  })

  it('returns identical delete bodies for foreign and nonexistent blocks', async () => {
    const foreignBody = await captureBody(() => readingBlocksService.deleteBlock(blockId, userBId))
    const missingBody = await captureBody(() => readingBlocksService.deleteBlock('00000000-0000-0000-0000-000000000000', userBId))

    expect(foreignBody).toEqual(missingBody)
  })
})
