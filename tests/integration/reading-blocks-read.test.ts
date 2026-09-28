import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { removeFixtures, trackSetup } from './fixtures'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)
const MARKER = `zz-reading-blocks-read-${Date.now()}`

interface H3ErrorLike {
  statusCode?: number
  data?: { error?: string; message?: string }
}

describe.skipIf(!hasDatabaseUrl)('Reading blocks read through visibleLogs', () => {
  let db: typeof import('../../server/db')['db']
  let schema: typeof import('../../server/db/schema')
  let catalogService: typeof import('../../server/services/catalog')
  let logsService: typeof import('../../server/services/logs')
  let readingBlocksService: typeof import('../../server/services/reading-blocks')

  const setup = trackSetup()

  let publicOwnerId: string
  let privateOwnerId: string
  let strangerId: string
  let publicLogId: string
  let privateLogId: string
  let hiddenProfileLogId: string

  beforeAll(() => setup.run(async () => {
    const dbModule = await import('../../server/db')
    db = dbModule.db
    schema = await import('../../server/db/schema')
    catalogService = await import('../../server/services/catalog')
    logsService = await import('../../server/services/logs')
    readingBlocksService = await import('../../server/services/reading-blocks')

    const suffix = Date.now() % 10000000

    const [publicOwner] = await db.insert(schema.users).values({
      email: `${MARKER}-pub@example.com`,
      handle: `rbrpub_${suffix}`,
      display_name: 'Dono Público',
      profile_visibility: 'publico',
    }).returning({ id: schema.users.id })
    const [privateOwner] = await db.insert(schema.users).values({
      email: `${MARKER}-priv@example.com`,
      handle: `rbrpriv_${suffix}`,
      display_name: 'Dono Privado',
      profile_visibility: 'privado',
    }).returning({ id: schema.users.id })
    const [stranger] = await db.insert(schema.users).values({
      email: `${MARKER}-out@example.com`,
      handle: `rbrout_${suffix}`,
      display_name: 'Visitante',
      profile_visibility: 'publico',
    }).returning({ id: schema.users.id })

    if (!publicOwner || !privateOwner || !stranger) {
      throw new Error('Não foi possível criar usuários de teste.')
    }
    publicOwnerId = publicOwner.id
    privateOwnerId = privateOwner.id
    strangerId = stranger.id

    const work = await catalogService.createWork({
      title: `${MARKER} Obra`,
      authors: [{ name: `${MARKER} Autor` }],
      genre_ids: [],
    }, publicOwnerId, { skipRateLimit: true })

    const publicLog = await logsService.createLog({
      work_id: work.id,
      finished_on: '2026-09-20',
      finished_precision: 'dia',
      visibility: 'publico',
    }, publicOwnerId, { skipRateLimit: true })
    publicLogId = publicLog.id

    const privateLog = await logsService.createLog({
      work_id: work.id,
      finished_on: '2026-09-21',
      finished_precision: 'dia',
      visibility: 'privado',
    }, publicOwnerId, { skipRateLimit: true })
    privateLogId = privateLog.id

    const hiddenProfileLog = await logsService.createLog({
      work_id: work.id,
      finished_on: '2026-09-22',
      finished_precision: 'dia',
      visibility: 'publico',
    }, privateOwnerId, { skipRateLimit: true })
    hiddenProfileLogId = hiddenProfileLog.id

    for (const [logId, ownerId] of [
      [publicLogId, publicOwnerId],
      [privateLogId, publicOwnerId],
      [hiddenProfileLogId, privateOwnerId],
    ] as const) {
      await readingBlocksService.createBlock(logId, ownerId, {
        start_page: 1,
        end_page: 10,
        read_at: '2026-09-20',
      })
    }
  }))

  afterAll(async () => {
    await setup.settled()
    await removeFixtures(MARKER)
  })

  async function expectNotFound(action: () => Promise<unknown>): Promise<void> {
    let caught: unknown
    try {
      await action()
    } catch (error: unknown) {
      caught = error
    }
    expect((caught as H3ErrorLike | undefined)?.statusCode).toBe(404)
    expect((caught as H3ErrorLike | undefined)?.data?.error).toBe('nao_encontrado')
  }

  it('returns the blocks of a public log on a public profile to anonymous viewers and strangers', async () => {
    const anonymous = await readingBlocksService.getBlocksForLog(publicLogId, null)
    expect(anonymous.blocks).toHaveLength(1)
    expect(anonymous.blocks[0]?.log_id).toBe(publicLogId)

    const fromStranger = await readingBlocksService.getBlocksForLog(publicLogId, { id: strangerId })
    expect(fromStranger.blocks).toHaveLength(1)
  })

  it('hides the blocks of a private log from anyone but its owner', async () => {
    await expectNotFound(() => readingBlocksService.getBlocksForLog(privateLogId, null))
    await expectNotFound(() => readingBlocksService.getBlocksForLog(privateLogId, { id: strangerId }))

    const fromOwner = await readingBlocksService.getBlocksForLog(privateLogId, { id: publicOwnerId })
    expect(fromOwner.blocks).toHaveLength(1)
  })

  it('hides the blocks of a public log on a private profile from anyone but its owner', async () => {
    await expectNotFound(() => readingBlocksService.getBlocksForLog(hiddenProfileLogId, null))
    await expectNotFound(() => readingBlocksService.getBlocksForLog(hiddenProfileLogId, { id: strangerId }))

    const fromOwner = await readingBlocksService.getBlocksForLog(hiddenProfileLogId, { id: privateOwnerId })
    expect(fromOwner.blocks).toHaveLength(1)
  })
})
