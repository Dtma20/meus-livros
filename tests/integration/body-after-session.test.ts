import { createServer, type Server } from 'node:http'
import { createApp, createRouter, defineEventHandler, readBody, toNodeListener } from 'h3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getSessionUser } from '../../server/utils/session'

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

        const user = await getSessionUser(event)

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

      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ handle: 'diogo', display_name: 'Diogo Amorim' }),
    })

    expect(response.status).toBe(200)
    const payload = await response.json() as { user: unknown, body: unknown }
    expect(payload.body).toEqual({ handle: 'diogo', display_name: 'Diogo Amorim' })

    expect(payload.user).toBeNull()
  }, 30_000)
})
