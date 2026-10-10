import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, defineEventHandler, toNodeListener } from 'h3'
import { createServer, request, type Server } from 'node:http'
import bodyLimitMiddleware from '../../server/middleware/body-limit'

const KB = 1024
const MB = 1024 * KB

describe('Body size limit (server/middleware/body-limit.ts)', () => {
  let server: Server
  let baseUrl: string
  let port: number

  beforeEach(async () => {
    const app = createApp()
    app.use(bodyLimitMiddleware)
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
    port = typeof addr === 'object' && addr ? addr.port : 0
    baseUrl = `http://127.0.0.1:${port}`
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('allows a POST body of exactly 64 KB', async () => {
    const res = await fetch(`${baseUrl}/test`, {
      method: 'POST',
      body: 'a'.repeat(64 * KB),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('rejects a POST body one byte over 64 KB with 413 in the documented shape', async () => {
    const res = await fetch(`${baseUrl}/test`, {
      method: 'POST',
      body: 'a'.repeat(64 * KB + 1),
    })
    expect(res.status).toBe(413)
    const body = await res.json()
    expect(body).toEqual({ error: 'corpo_muito_grande', message: 'A requisição é grande demais.' })
  })

  it.each(['PUT', 'PATCH', 'DELETE'])('rejects an oversized %s body with 413', async (method) => {
    const res = await fetch(`${baseUrl}/test`, {
      method,
      body: 'a'.repeat(64 * KB + 1),
    })
    expect(res.status).toBe(413)
    const body = await res.json()
    expect(body.error).toBe('corpo_muito_grande')
  })

  it('accepts a 1 MB body on POST /api/library/import', async () => {
    const res = await fetch(`${baseUrl}/api/library/import`, {
      method: 'POST',
      body: 'a'.repeat(1 * MB),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('rejects a body one byte over 4 MB on POST /api/library/import', async () => {
    const res = await fetch(`${baseUrl}/api/library/import`, {
      method: 'POST',
      body: 'a'.repeat(4 * MB + 1),
    })
    expect(res.status).toBe(413)
    const body = await res.json()
    expect(body.error).toBe('corpo_muito_grande')
  })

  it('keeps the 64 KB limit for other routes, including those under /api/library', async () => {
    const res = await fetch(`${baseUrl}/api/library/other`, {
      method: 'POST',
      body: 'a'.repeat(1 * MB),
    })
    expect(res.status).toBe(413)
  })

  it('does not apply the import exception to other methods on the import path', async () => {
    const res = await fetch(`${baseUrl}/api/library/import`, {
      method: 'PUT',
      body: 'a'.repeat(1 * MB),
    })
    expect(res.status).toBe(413)
  })

  it('rejects a chunked body that has no content-length with 413', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          path: '/test',
          method: 'POST',
          headers: { 'transfer-encoding': 'chunked' },
        },
        (res) => {
          res.resume()
          resolve(res.statusCode ?? 0)
        },
      )
      req.on('error', reject)
      req.write('a')
      req.end()
    })
    expect(status).toBe(413)
  })

  it('does not affect GET requests', async () => {
    const res = await fetch(`${baseUrl}/test`, { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})
