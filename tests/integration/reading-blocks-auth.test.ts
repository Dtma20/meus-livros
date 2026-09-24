import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isError } from 'h3'
import type { ReadingBlockInput, UpdateReadingBlockInput } from '../../shared/schemas/reading-block'
import { removeFixtures } from './fixtures'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)
const MARKER = `zz-reading-blocks-auth-${Date.now()}`

describe.skipIf(!hasDatabaseUrl)('Reading blocks authorization integration tests', () => {
  let db: typeof import('../../server/db')['db']
  let client: typeof import('../../server/db')['client']
  let schema: typeof import('../../server/db/schema')
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
  })

  afterAll(async () => {
    try {
      await removeFixtures(MARKER)
    } finally {
      await client?.end()
    }
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

  it('returns identical create bodies for a foreign and a nonexistent log', async () => {
    // O 403 anterior confirmava a existência do *registro de leitura*, não do
    // bloco: bastava comparar as respostas de um logId alheio e de um inventado.
    const input: ReadingBlockInput = { start_page: 1, end_page: 5, read_at: '2026-09-20' }
    const foreignBody = await captureBody(() => readingBlocksService.createBlock(logId, userBId, input))
    const missingBody = await captureBody(() => readingBlocksService.createBlock('00000000-0000-0000-0000-000000000000', userBId, input))

    expect(foreignBody).toEqual(missingBody)
  })

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
