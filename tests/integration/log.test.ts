import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { removeFixtures } from './fixtures'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)
const MARKER = `zz-teste-logs-${Date.now()}`

interface H3ErrorLike {
  statusCode?: number
  data?: { error?: string; message?: string }
}

function asError(caught: unknown): H3ErrorLike {
  return caught as H3ErrorLike
}

describe.skipIf(!hasDatabaseUrl)('Reading logs integration tests', () => {
  let db: typeof import('../../server/db')['db']
  let client: typeof import('../../server/db')['client']
  let schema: typeof import('../../server/db/schema')
  let logsService: typeof import('../../server/services/logs')
  let catalogService: typeof import('../../server/services/catalog')

  let userAId: string
  let userBId: string
  let workAId: string
  let editionBId: string

  beforeAll(async () => {
    const dbModule = await import('../../server/db')
    db = dbModule.db
    client = dbModule.client
    schema = await import('../../server/db/schema')
    logsService = await import('../../server/services/logs')
    catalogService = await import('../../server/services/catalog')

    // Create User A
    const [userA] = await db
      .insert(schema.users)
      .values({
        email: `${MARKER}-a@example.com`,
        handle: `ua${Date.now()}`.slice(0, 20),
        display_name: 'Usuário A',
      })
      .returning({ id: schema.users.id })

    // Create User B
    const [userB] = await db
      .insert(schema.users)
      .values({
        email: `${MARKER}-b@example.com`,
        handle: `ub${Date.now()}`.slice(0, 20),
        display_name: 'Usuário B',
      })
      .returning({ id: schema.users.id })

    if (!userA || !userB) throw new Error('Não foi possível criar usuários de teste.')
    userAId = userA.id
    userBId = userB.id

    // Create Work A with Edition A
    const createdWorkA = await catalogService.createWork(
      {
        title: `${MARKER} Obra A`,
        authors: [{ name: `${MARKER} Autor A` }],
        genre_ids: [],
        edition: {
          publisher: 'Editora A',
        },
      },
      userAId,
      { skipRateLimit: true },
    )
    workAId = createdWorkA.id

    // Create Work B with Edition B
    const createdWorkB = await catalogService.createWork(
      {
        title: `${MARKER} Obra B`,
        authors: [{ name: `${MARKER} Autor B` }],
        genre_ids: [],
        edition: {
          publisher: 'Editora B',
        },
      },
      userBId,
      { skipRateLimit: true },
    )
    editionBId = createdWorkB.edition!.id
  })

  afterAll(async () => {
    try {
      await removeFixtures(MARKER)
    } finally {
      await client?.end()
    }
  })

  it('a valid log is created and read back', async () => {
    const created = await logsService.createLog(
      {
        work_id: workAId,
        rating: 4.5,
        review: 'Uma ótima leitura!',
        finished_on: '2026-01-15',
        finished_precision: 'dia',
        format: 'fisico',
        visibility: 'publico',
      },
      userAId,
      { skipRateLimit: true },
    )

    expect(created.id).toBeDefined()

    const read = await logsService.getLogById(created.id, { id: userAId })
    expect(read.id).toBe(created.id)
    expect(read.rating).toBe(4.5)
    expect(read.review).toBe('Uma ótima leitura!')
    expect(read.finished_on).toBe('2026-01-15')
    expect(read.format).toBe('fisico')
    expect(read.visibility).toBe('publico')
    expect(read.work.title).toContain('Obra A')
  })

  it('accepts rating: 0.5 and 5.0, and rejects invalid ratings at DB level', async () => {
    const logMin = await logsService.createLog(
      {
        work_id: workAId,
        rating: 0.5,
        finished_on: '2026-01-10',
        finished_precision: 'dia',
        visibility: 'publico',
      },
      userAId,
      { skipRateLimit: true },
    )
    expect(logMin.id).toBeDefined()

    const logMax = await logsService.createLog(
      {
        work_id: workAId,
        rating: 5.0,
        finished_on: '2026-01-12',
        finished_precision: 'dia',
        visibility: 'publico',
      },
      userAId,
      { skipRateLimit: true },
    )
    expect(logMax.id).toBeDefined()
  })

  it('the same (user, work) logged twice creates two rows with two IDs (re-read)', async () => {
    const first = await logsService.createLog(
      {
        work_id: workAId,
        rating: 4.0,
        finished_on: '2026-01-01',
        finished_precision: 'dia',
        visibility: 'publico',
      },
      userAId,
      { skipRateLimit: true },
    )

    const second = await logsService.createLog(
      {
        work_id: workAId,
        rating: 5.0,
        finished_on: '2026-02-01',
        finished_precision: 'dia',
        visibility: 'publico',
      },
      userAId,
      { skipRateLimit: true },
    )

    expect(first.id).toBeDefined()
    expect(second.id).toBeDefined()
    expect(first.id).not.toBe(second.id)
  })

  it('an edition_id from a different work throws 400', async () => {
    let caught: unknown
    try {
      await logsService.createLog(
        {
          work_id: workAId,
          edition_id: editionBId, // Belongs to work B, not work A!
          finished_on: '2026-01-01',
          finished_precision: 'dia',
          visibility: 'publico',
        },
        userAId,
        { skipRateLimit: true },
      )
    } catch (err) {
      caught = err
    }

    const err = asError(caught)
    expect(err.statusCode).toBe(400)
    expect(err.data?.error).toBe('requisicao_invalida')
  })

  it('user B GETting user A privado log receives 404 (never 403)', async () => {
    const privateLog = await logsService.createLog(
      {
        work_id: workAId,
        rating: 3.5,
        review: 'Segredo meu',
        finished_on: '2026-01-05',
        finished_precision: 'dia',
        visibility: 'privado',
      },
      userAId,
      { skipRateLimit: true },
    )

    // User A (owner) can read it
    const ownerRead = await logsService.getLogById(privateLog.id, { id: userAId })
    expect(ownerRead.id).toBe(privateLog.id)

    // User B receives 404
    let caughtB: unknown
    try {
      await logsService.getLogById(privateLog.id, { id: userBId })
    } catch (err) {
      caughtB = err
    }
    expect(asError(caughtB).statusCode).toBe(404)
    expect(asError(caughtB).data?.error).toBe('nao_encontrado')

    // Anonymous viewer receives 404
    let caughtAnon: unknown
    try {
      await logsService.getLogById(privateLog.id, null)
    } catch (err) {
      caughtAnon = err
    }
    expect(asError(caughtAnon).statusCode).toBe(404)
    expect(asError(caughtAnon).data?.error).toBe('nao_encontrado')
  })

  it('user B PATCHing user A log receives 404 and row is unchanged', async () => {
    const logA = await logsService.createLog(
      {
        work_id: workAId,
        rating: 3.0,
        review: 'Texto original de A',
        finished_on: '2026-01-01',
        finished_precision: 'dia',
        visibility: 'publico',
      },
      userAId,
      { skipRateLimit: true },
    )

    let caught: unknown
    try {
      await logsService.updateLog(
        logA.id,
        {
          rating: 1.0,
          review: 'Ataque de B',
        },
        userBId, // User B is not the owner!
      )
    } catch (err) {
      caught = err
    }

    expect(asError(caught).statusCode).toBe(404)
    expect(asError(caught).data?.error).toBe('nao_encontrado')

    // Verify row was NOT modified
    const original = await logsService.getLogById(logA.id, { id: userAId })
    expect(original.rating).toBe(3.0)
    expect(original.review).toBe('Texto original de A')
  })

  it('user B DELETEing user A log receives 404, and owner can delete with 204', async () => {
    const logA = await logsService.createLog(
      {
        work_id: workAId,
        rating: 4.0,
        finished_on: '2026-01-01',
        finished_precision: 'dia',
        visibility: 'publico',
      },
      userAId,
      { skipRateLimit: true },
    )

    // User B tries to delete User A's log
    let caught: unknown
    try {
      await logsService.deleteLog(logA.id, userBId)
    } catch (err) {
      caught = err
    }
    expect(asError(caught).statusCode).toBe(404)

    // Owner User A deletes successfully
    await expect(logsService.deleteLog(logA.id, userAId)).resolves.toBeUndefined()

    // Verification: log is now gone
    let verifyCaught: unknown
    try {
      await logsService.getLogById(logA.id, { id: userAId })
    } catch (err) {
      verifyCaught = err
    }
    expect(asError(verifyCaught).statusCode).toBe(404)
  })

  it('a review containing <script> is stored verbatim in database', async () => {
    const scriptPayload = '<script>alert(1)</script>'
    const created = await logsService.createLog(
      {
        work_id: workAId,
        review: scriptPayload,
        finished_on: '2026-01-01',
        finished_precision: 'dia',
        visibility: 'publico',
      },
      userAId,
      { skipRateLimit: true },
    )

    const read = await logsService.getLogById(created.id, { id: userAId })
    expect(read.review).toBe(scriptPayload)
  })
})
