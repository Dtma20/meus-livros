import { createServer, type Server } from 'node:http'
import { createApp, createRouter, toNodeListener } from 'h3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { removeFixtures, trackSetup } from './fixtures'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)
const MARKER = `t035-members-${Date.now()}`

describe.skipIf(!hasDatabaseUrl)('TASK-035 - Members page and service integration tests', () => {
  let db: typeof import('../../server/db')['db']
  let client: typeof import('../../server/db')['client']
  let schema: typeof import('../../server/db/schema')
  let membersService: typeof import('../../server/services/members')
  let logsService: typeof import('../../server/services/logs')
  let catalogService: typeof import('../../server/services/catalog')

  let server: Server | null = null
  let membersApiUrl: string

  let userAId: string
  let userBId: string
  let userCId: string

  let userAHandle: string
  let userBHandle: string
  let userCHandle: string

  const createdWorkIds: string[] = []
  const setup = trackSetup()

  beforeAll(() => setup.run(async () => {
    const dbModule = await import('../../server/db')
    db = dbModule.db
    client = dbModule.client
    schema = await import('../../server/db/schema')
    membersService = await import('../../server/services/members')
    logsService = await import('../../server/services/logs')
    catalogService = await import('../../server/services/catalog')

    const app = createApp()
    const router = createRouter()
    const { default: membersHandler } = await import('../../server/api/members/index.get')
    router.get('/api/members', membersHandler)
    app.use(router)
    server = createServer(toNodeListener(app))
    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    membersApiUrl = `http://127.0.0.1:${port}/api/members`

    userAHandle = `u35a_${Date.now() % 10000000}`
    const [userA] = await db
      .insert(schema.users)
      .values({
        email: `${MARKER}-a@example.com`,
        handle: userAHandle,
        display_name: 'Membro Teste A',
        profile_visibility: 'publico',
      })
      .returning({ id: schema.users.id })

    userBHandle = `u35b_${Date.now() % 10000000}`
    const [userB] = await db
      .insert(schema.users)
      .values({
        email: `${MARKER}-b@example.com`,
        handle: userBHandle,
        display_name: 'Membro Teste B',
        profile_visibility: 'publico',
      })
      .returning({ id: schema.users.id })

    userCHandle = `u35c_${Date.now() % 10000000}`
    const [userC] = await db
      .insert(schema.users)
      .values({
        email: `${MARKER}-c@example.com`,
        handle: userCHandle,
        display_name: 'Membro Teste C',
        profile_visibility: 'privado',
      })
      .returning({ id: schema.users.id })

    if (!userA || !userB || !userC) {
      throw new Error('Falha ao criar usuários para testes de membros.')
    }

    userAId = userA.id
    userBId = userB.id
    userCId = userC.id

    const work1 = await catalogService.createWork(
      {
        title: `${MARKER} Obra Um`,
        authors: [{ name: `${MARKER} Autor Um` }],
        genre_ids: [],
        edition: {
          publisher: 'Editora Teste',
          cover_url: 'https://example.com/capa1.jpg',
        },
      },
      userAId,
      { skipRateLimit: true },
    )
    createdWorkIds.push(work1.id)

    const work2 = await catalogService.createWork(
      {
        title: `${MARKER} Obra Dois`,
        authors: [{ name: `${MARKER} Autor Dois` }],
        genre_ids: [],
        edition: {
          publisher: 'Editora Teste',
          cover_url: 'https://example.com/capa2.jpg',
        },
      },
      userAId,
      { skipRateLimit: true },
    )
    createdWorkIds.push(work2.id)

    await logsService.createLog(
      {
        work_id: work1.id,
        edition_id: work1.edition?.id,
        rating: 4.5,
        finished_on: '2026-03-01',
        finished_precision: 'dia',
        visibility: 'publico',
      },
      userAId,
      { skipRateLimit: true },
    )

    await logsService.createLog(
      {
        work_id: work2.id,
        edition_id: work2.edition?.id,
        rating: 3.0,
        finished_on: '2026-03-02',
        finished_precision: 'dia',
        visibility: 'privado',
      },
      userAId,
      { skipRateLimit: true },
    )

    await logsService.createLog(
      {
        work_id: work1.id,
        edition_id: work1.edition?.id,
        rating: 5.0,
        finished_on: '2026-03-03',
        finished_precision: 'dia',
        visibility: 'publico',
      },
      userCId,
      { skipRateLimit: true },
    )

    await logsService.createLog(
      {
        work_id: work2.id,
        edition_id: work2.edition?.id,
        rating: 2.0,
        finished_on: '2026-03-04',
        finished_precision: 'dia',
        visibility: 'privado',
      },
      userCId,
      { skipRateLimit: true },
    )
  }))

  afterAll(async () => {
    await setup.settled()
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()))
    }
    try {
      await removeFixtures(MARKER)
    } finally {
      await client?.end()
    }
  })

  it('1. GET /api/members without session returns 401', async () => {
    const response = await fetch(membersApiUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    })

    expect(response.status).toBe(401)
    const body = (await response.json()) as { error?: string }
    expect(body.error).toBe('nao_autenticado')
  }, 30_000)

  it('2. Private profile is absent for others and present for self', async () => {
    const listForStranger = await membersService.listMembers({ id: userBId })
    const strangerHandles = listForStranger.members.map((m) => m.handle)

    expect(strangerHandles).toContain(userAHandle)
    expect(strangerHandles).toContain(userBHandle)
    expect(strangerHandles).not.toContain(userCHandle)

    const listForAnon = await membersService.listMembers(null)
    const anonHandles = listForAnon.members.map((m) => m.handle)
    expect(anonHandles).toContain(userAHandle)
    expect(anonHandles).not.toContain(userCHandle)

    const listForSelf = await membersService.listMembers({ id: userCId })
    const selfHandles = listForSelf.members.map((m) => m.handle)
    expect(selfHandles).toContain(userCHandle)
  }, 30_000)

  it('3. Private logs are excluded from count, last activity and covers', async () => {
    const listForOther = await membersService.listMembers({ id: userBId })
    const memberAForOther = listForOther.members.find((m) => m.handle === userAHandle)

    expect(memberAForOther).toBeDefined()
    expect(memberAForOther!.visible_log_count).toBe(1)
    expect(memberAForOther!.recent_covers).toHaveLength(1)
    expect(memberAForOther!.recent_covers[0]?.work_title).toBe(`${MARKER} Obra Um`)

    const listForSelf = await membersService.listMembers({ id: userAId })
    const memberAForSelf = listForSelf.members.find((m) => m.handle === userAHandle)

    expect(memberAForSelf).toBeDefined()
    expect(memberAForSelf!.visible_log_count).toBe(2)
    expect(memberAForSelf!.recent_covers).toHaveLength(2)
  }, 30_000)

  it('4. Orders by last_activity_at desc nulls last, then display_name', async () => {
    const list = await membersService.listMembers({ id: userBId })
    const scopedMembers = list.members.filter(
      (m) => m.handle === userAHandle || m.handle === userBHandle,
    )

    expect(scopedMembers.length).toBe(2)
    expect(scopedMembers[0]?.handle).toBe(userAHandle)
    expect(scopedMembers[1]?.handle).toBe(userBHandle)
    expect(scopedMembers[1]?.visible_log_count).toBe(0)
    expect(scopedMembers[1]?.last_activity_at).toBeNull()
  }, 30_000)
})
