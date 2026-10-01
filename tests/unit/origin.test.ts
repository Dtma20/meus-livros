import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, defineEventHandler, toNodeListener } from 'h3'
import { createServer, type Server } from 'node:http'
import originMiddleware from '../../server/middleware/origin'

describe('CSRF Origin Middleware (server/middleware/origin.ts)', () => {
  let server: Server
  let baseUrl: string
  const originalBetterAuthUrl = process.env.BETTER_AUTH_URL

  beforeEach(async () => {
    process.env.BETTER_AUTH_URL = 'https://meuslivros.app'

    const app = createApp()
    app.use(originMiddleware)
    app.use(
      defineEventHandler((event) => {
        return { ok: true, method: event.method }
      }),
    )

    server = createServer(toNodeListener(app))
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    baseUrl = `http://127.0.0.1:${port}`
  })

  afterEach(async () => {
    if (originalBetterAuthUrl !== undefined) {
      process.env.BETTER_AUTH_URL = originalBetterAuthUrl
    } else {
      delete process.env.BETTER_AUTH_URL
    }
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('allows non-mutating requests (GET) even with a foreign origin', async () => {
    const res = await fetch(`${baseUrl}/test`, {
      method: 'GET',
      headers: { origin: 'https://evil-site.com' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('allows %s with no origin header', async (method) => {
    const res = await fetch(`${baseUrl}/test`, {
      method,
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('allows mutating request when origin matches request host', async () => {
    const res = await fetch(`${baseUrl}/test`, {
      method: 'POST',
      headers: {
        origin: baseUrl,
      },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('allows mutating request when origin matches canonical BETTER_AUTH_URL host', async () => {
    const res = await fetch(`${baseUrl}/test`, {
      method: 'PUT',
      headers: {
        origin: 'https://meuslivros.app',
      },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('rejects %s from an untrusted foreign origin with 403', async (method) => {
    const res = await fetch(`${baseUrl}/test`, {
      method,
      headers: {
        origin: 'https://attacker.example.com',
      },
    })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body).toMatchObject({ statusCode: 403, data: { error: 'origem_invalida' } })
  })

  it('rejects mutating request (DELETE) from an untrusted foreign origin with 403', async () => {
    const res = await fetch(`${baseUrl}/test`, {
      method: 'DELETE',
      headers: {
        origin: 'http://localhost:9999',
      },
    })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.data?.error || body.error).toBe('origem_invalida')
  })

  it('rejects mutating request (PATCH) with malformed origin header with 403', async () => {
    const res = await fetch(`${baseUrl}/test`, {
      method: 'PATCH',
      headers: {
        origin: 'not-a-valid-url',
      },
    })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.data?.error || body.error).toBe('origem_invalida')
  })
})
