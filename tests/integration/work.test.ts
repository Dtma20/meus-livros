import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { formatPublicationYear } from '../../shared/schemas/work'
import { removeFixtures } from './fixtures'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)
const MARKER = `zz-teste-work-${Date.now()}`

interface H3ErrorLike {
  statusCode?: number
  data?: { error?: string; message?: string }
}

function asError(caught: unknown): H3ErrorLike {
  return caught as H3ErrorLike
}

describe.skipIf(!hasDatabaseUrl)('Work service integration tests (TASK-015)', () => {
  let db: typeof import('../../server/db')['db']
  let client: typeof import('../../server/db')['client']
  let schema: typeof import('../../server/db/schema')
  let worksService: typeof import('../../server/services/works')
  let catalogService: typeof import('../../server/services/catalog')
  let logsService: typeof import('../../server/services/logs')

  let userAId: string
  let userBId: string
  let workAId: string
  let workASlug: string
  let workBSlug: string
  let privateLogId: string
  let publicLogIds: string[] = []

  beforeAll(async () => {
    const dbModule = await import('../../server/db')
    db = dbModule.db
    client = dbModule.client
    schema = await import('../../server/db/schema')
    worksService = await import('../../server/services/works')
    catalogService = await import('../../server/services/catalog')
    logsService = await import('../../server/services/logs')

    // Create User A (author of public logs)
    const [userA] = await db
      .insert(schema.users)
      .values({
        email: `${MARKER}-a@example.com`,
        handle: `wa${Date.now()}`.slice(0, 20),
        display_name: 'Usuário A',
        profile_visibility: 'publico',
      })
      .returning({ id: schema.users.id })

    // Create User B (author of private log)
    const [userB] = await db
      .insert(schema.users)
      .values({
        email: `${MARKER}-b@example.com`,
        handle: `wb${Date.now()}`.slice(0, 20),
        display_name: 'Usuário B',
        profile_visibility: 'publico',
      })
      .returning({ id: schema.users.id })

    if (!userA || !userB) throw new Error('Não foi possível criar usuários de teste.')
    userAId = userA.id
    userBId = userB.id

    // Create Work A with first_published_year = -500
    const createdWorkA = await catalogService.createWork(
      {
        title: `${MARKER} Obra Antiga`,
        authors: [{ name: `${MARKER} Autor Clássico` }],
        first_published_year: -500,
        genre_ids: [],
        edition: {
          publisher: 'Editora Clássica',
        },
      },
      userAId,
      { skipRateLimit: true },
    )
    workAId = createdWorkA.id
    workASlug = createdWorkA.slug

    // Create Work B with no logs
    const createdWorkB = await catalogService.createWork(
      {
        title: `${MARKER} Obra Vazia`,
        authors: [{ name: `${MARKER} Autor Vazio` }],
        genre_ids: [],
      },
      userAId,
      { skipRateLimit: true },
    )
    void createdWorkB
    workBSlug = createdWorkB.slug

    // Create 3 public logs for Work A: ratings 4.0, 5.0, 4.0 (average = 4.3)
    const log1 = await logsService.createLog(
      {
        work_id: workAId,
        rating: 4.0,
        review: 'Primeira leitura pública',
        finished_precision: 'dia',
        visibility: 'publico',
      },
      userAId,
      { skipRateLimit: true },
    )
    const log2 = await logsService.createLog(
      {
        work_id: workAId,
        rating: 5.0,
        review: 'Segunda leitura pública',
        finished_precision: 'dia',
        visibility: 'publico',
      },
      userAId,
      { skipRateLimit: true },
    )
    const log3 = await logsService.createLog(
      {
        work_id: workAId,
        rating: 4.0,
        review: 'Terceira leitura pública',
        finished_precision: 'dia',
        visibility: 'publico',
      },
      userBId,
      { skipRateLimit: true },
    )
    publicLogIds = [log1.id, log2.id, log3.id]

    // Create 1 private log for Work A: rating 1.0 (owned by User B)
    const logPriv = await logsService.createLog(
      {
        work_id: workAId,
        rating: 1.0,
        review: 'Leitura privada e crítica',
        finished_precision: 'dia',
        visibility: 'privado',
      },
      userBId,
      { skipRateLimit: true },
    )
    privateLogId = logPriv.id
  })

  afterAll(async () => {
    try {
      await removeFixtures(MARKER)
    } finally {
      await client?.end()
    }
  })

  it('a work with 3 público and 1 privado log shows 3 to an anonymous viewer', async () => {
    const result = await worksService.getWorkBySlug(workASlug, null)

    expect(result.log_count).toBe(3)
    expect(result.logs).toHaveLength(3)

    const ids = result.logs.map((l) => l.id)
    expect(ids).toEqual(expect.arrayContaining(publicLogIds))
    expect(ids).not.toContain(privateLogId)
  }, 20000)

  it('the owner of the privado log sees 4 entries including their own', async () => {
    const result = await worksService.getWorkBySlug(workASlug, { id: userBId })

    expect(result.log_count).toBe(4)
    expect(result.logs).toHaveLength(4)

    const ids = result.logs.map((l) => l.id)
    expect(ids).toContain(privateLogId)
    expect(ids).toEqual(expect.arrayContaining(publicLogIds))
  }, 20000)

  it('the average rating excludes the privado log for anonymous viewers', async () => {
    const resultAnon = await worksService.getWorkBySlug(workASlug, null)
    // 3 public logs: 4.0, 5.0, 4.0 -> average = 13 / 3 = 4.333... -> 4.3
    expect(resultAnon.average_rating).toBe(4.3)

    // Private owner: includes the 1.0 rating -> (4 + 5 + 4 + 1) / 4 = 14 / 4 = 3.5
    const resultOwner = await worksService.getWorkBySlug(workASlug, { id: userBId })
    expect(resultOwner.average_rating).toBe(3.5)
  }, 20000)

  it('a work with first_published_year = -500 renders 500 a.C.', async () => {
    const result = await worksService.getWorkBySlug(workASlug, null)
    expect(result.first_published_year).toBe(-500)
    expect(formatPublicationYear(result.first_published_year)).toBe('500 a.C.')
  }, 20000)

  it('a work with no visible logs renders log_count = 0 and average_rating = null (never 0,0)', async () => {
    const result = await worksService.getWorkBySlug(workBSlug, null)
    expect(result.log_count).toBe(0)
    expect(result.logs).toHaveLength(0)
    expect(result.average_rating).toBeNull()
  }, 20000)

  it('an unknown slug returns 404', async () => {
    let caught: unknown
    try {
      await worksService.getWorkBySlug('obra-inexistente-slug-xyz', null)
    } catch (err) {
      caught = err
    }

    const err = asError(caught)
    expect(err.statusCode).toBe(404)
    expect(err.data?.error).toBe('nao_encontrado')
  }, 20000)
})
