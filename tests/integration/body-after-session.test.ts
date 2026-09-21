import { createServer, type Server } from 'node:http'
import { createApp, createRouter, defineEventHandler, readBody, toNodeListener } from 'h3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getSessionUser } from '../../server/utils/session'

/**
 * The whole authenticated write path hung, in dev and in the production build,
 * and no test noticed for one reason: every test drives the *services*
 * (`createLog`, `createUser`) and none drives the HTTP route with a body.
 *
 * `getSessionUser` used to resolve the session through
 * `toWebRequest(event).headers`. toWebRequest builds
 * `new Request(url, { body: getRequestWebStream(event), duplex: 'half' })`,
 * which attaches a ReadableStream over `event.node.req`. On the next await —
 * validating the session against Neon, ~500 ms — that stream drains the node
 * request, and the `readBody(event)` that follows waits on `data`/`end` events
 * that already fired. Forever. POST /api/users, POST /api/logs,
 * PATCH /api/logs/:id, PATCH /api/users/me, POST /api/works and
 * POST /api/works/:id/editions were all shaped exactly that way.
 *
 * Minimal reproduction, which is what this test automates:
 *   toWebRequest + 0 ms   + readBody  ->  200 in 18 ms
 *   toWebRequest + 600 ms + readBody  ->  hangs
 *   (no toWebRequest) + 600 ms + readBody -> 200 in 614 ms
 *
 * So the delay is load-bearing: without it the bug does not appear, which is
 * why a fast local database would have hidden this even from a route-level
 * test. The sleep below is not padding.
 *
 * No database round trip is needed — with no cookie, better-auth answers null
 * without querying — but `server/db` throws at import without DATABASE_URL, so
 * the file is skipped when it is absent, like the rest of the suite.
 */
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDatabaseUrl)('reading a request body after resolving the session', () => {
  let server: Server
  let url: string

  beforeAll(async () => {
    const app = createApp()
    const router = createRouter()

    router.post(
      '/alvo',
      defineEventHandler(async (event) => {
        // The shape every authenticated mutating route has: resolve who is
        // asking, then read what they sent.
        const user = await getSessionUser(event)
        // Stands in for the round trip to Neon that the real session lookup
        // makes. The bug needs an await here and does not appear without one.
        await new Promise((resolve) => setTimeout(resolve, 600))
        const body = await readBody(event)
        return { user, body }
      }),
    )

    app.use(router)
    server = createServer(toNodeListener(app))
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    url = `http://127.0.0.1:${port}/alvo`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  })

  it('answers instead of hanging, and the body arrives intact', async () => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // A 10s ceiling on a request that should take ~600ms: generous enough not
      // to flake on a slow link, short enough that the regression fails the run
      // rather than stalling it.
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ handle: 'diogo', display_name: 'Diogo Amorim' }),
    })

    expect(response.status).toBe(200)
    const payload = await response.json() as { user: unknown, body: unknown }
    expect(payload.body).toEqual({ handle: 'diogo', display_name: 'Diogo Amorim' })
    // No cookie was sent, so there is no session. The assertion that matters is
    // the one above: the body survived the session lookup.
    expect(payload.user).toBeNull()
  }, 30_000)
})
