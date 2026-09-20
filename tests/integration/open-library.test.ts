import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import externoHandler from '../../server/api/search/externo.get'
import { checkRateLimit } from '../../server/services/rate-limit'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)
const MARKER = `zz-ol-test-${Date.now()}`

describe.skipIf(!hasDatabaseUrl)('Open Library integration & rate limit tests', () => {
  let db: typeof import('../../server/db')['db']
  let client: typeof import('../../server/db')['client']
  let schema: typeof import('../../server/db/schema')
  let sqlOp: typeof import('drizzle-orm')
  let userId: string

  beforeAll(async () => {
    const dbModule = await import('../../server/db')
    db = dbModule.db
    client = dbModule.client
    schema = await import('../../server/db/schema')
    sqlOp = await import('drizzle-orm')

    const [user] = await db
      .insert(schema.users)
      .values({
        email: `${MARKER}@example.com`,
        handle: `ol${Date.now()}`.slice(0, 20),
        display_name: 'Usuário OL Test',
      })
      .returning({ id: schema.users.id })

    if (!user) throw new Error('Falha ao criar usuário de teste.')
    userId = user.id
  })

  afterAll(async () => {
    if (!userId) return
    await db.delete(schema.users).where(sqlOp.eq(schema.users.id, userId))
    await client.end()
  })

  function createMockEvent(options: {
    query?: Record<string, string>
    user?: { id: string; email: string } | null
  }): H3Event {
    const queryParams = new URLSearchParams(options.query || {})
    const url = `/api/search/externo?${queryParams.toString()}`
    const headers = new Headers()
    const request = new Request(`http://localhost${url}`, {
      method: 'GET',
      headers,
    })

    return {
      path: url,
      node: {
        req: {
          url,
          method: 'GET',
          headers: {},
        },
        res: {
          statusCode: 200,
          setHeader: vi.fn(),
          end: vi.fn(),
        },
      },
      web: {
        request,
        url: new URL(`http://localhost${url}`),
      },
      headers,
      context: {
        ...(options.user ? { user: options.user } : {}),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
  }

  it('an unauthenticated request returns 401', async () => {
    const event = createMockEvent({
      query: { q: 'Dom Casmurro' },
      user: null,
    })

    const response = await externoHandler(event)
    expect(response).toMatchObject({
      error: 'nao_autenticado',
    })
    expect(event.node.res.statusCode).toBe(401)
  })

  it('rate limits to 20 lookups per user per hour and returns 429 on the 21st lookup', async () => {
    // Fill up the rate limit bucket for this user
    const rateLimitKey = `ol_search:user:${userId}`

    // 20 requests should all be allowed
    for (let i = 1; i <= 20; i++) {
      const allowed = await checkRateLimit(rateLimitKey, 20)
      expect(allowed).toBe(true)
    }

    // The 21st request should be rejected by rate limiting
    const allowed21 = await checkRateLimit(rateLimitKey, 20)
    expect(allowed21).toBe(false)

    // Now call the handler with this user; it should return 429
    const event = createMockEvent({
      query: { q: 'Dom Casmurro' },
      user: { id: userId, email: `${MARKER}@example.com` },
    })

    const res = await externoHandler(event)
    expect(event.node.res.statusCode).toBe(429)
    expect(res).toMatchObject({
      error: 'muitas_tentativas',
    })
  })
})
