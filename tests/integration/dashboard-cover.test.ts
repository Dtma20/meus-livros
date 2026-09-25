import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { removeFixtures } from './fixtures'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)
const MARKER = `zz-dashboard-cover-${Date.now()}`

describe.skipIf(!hasDatabaseUrl)('Dashboard cover fallback integration tests', () => {
  let db: typeof import('../../server/db')['db']
  let client: typeof import('../../server/db')['client']
  let schema: typeof import('../../server/db/schema')
  let dashboardService: typeof import('../../server/services/dashboard')

  let testUserId: string

  beforeAll(async () => {
    const dbModule = await import('../../server/db')
    db = dbModule.db
    client = dbModule.client
    schema = await import('../../server/db/schema')
    dashboardService = await import('../../server/services/dashboard')

    const [user] = await db
      .insert(schema.users)
      .values({
        email: `${MARKER}@example.com`,
        handle: `dc_${Date.now()}`.slice(0, 20),
        display_name: 'Usuário Capa',
        profile_visibility: 'publico',
      })
      .returning({ id: schema.users.id })

    if (!user) throw new Error('Falha ao criar usuário de teste.')
    testUserId = user.id

    const [work] = await db
      .insert(schema.works)
      .values({
        title: `${MARKER} Obra`,
        slug: `${MARKER}-obra`,
        created_by: testUserId,
      })
      .returning({ id: schema.works.id })

    if (!work) throw new Error('Falha ao criar obra de teste.')

    await db.insert(schema.editions).values({
      work_id: work.id,
      isbn13: '9780000000026',
      publisher: 'Editora Capa',
      created_by: testUserId,
    })

    // Log sem edition_id: o fallback busca em qualquer edição da obra.
    await db.insert(schema.reading_logs).values({
      user_id: testUserId,
      work_id: work.id,
      visibility: 'publico',
    })

    // Work criado sem nenhum reading_log (deve aparecer na estante)
    await db.insert(schema.works).values({
      title: `${MARKER} Estante`,
      slug: `${MARKER}-estante`,
      created_by: testUserId,
    })
  })

  afterAll(async () => {
    try {
      await removeFixtures(MARKER)
    } finally {
      await client?.end()
    }
  })

  it('returns the work edition isbn13 for a log without edition_id', async () => {
    const data = await dashboardService.getDashboardData(testUserId)

    expect(data.inProgress).toHaveLength(1)
    expect(data.inProgress[0]!.work.isbn13).toBe('9780000000026')
  })

  it('returns registered works without reading logs in shelf', async () => {
    const data = await dashboardService.getDashboardData(testUserId)

    expect(data.shelf).toHaveLength(1)
    expect(data.shelf[0]!.work.title).toBe(`${MARKER} Estante`)
  })
})
