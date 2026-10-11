import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, defineEventHandler, toNodeListener } from 'h3'
import { createServer, request, type Server } from 'node:http'
import { connect } from 'node:net'
import bodyLimitMiddleware from '../../server/middleware/body-limit'

const KB = 1024
const MB = 1024 * KB

// Sends a hand-written HTTP/1.1 request and returns the raw response. Node's http client adds
// content-length to an empty POST on its own, so a request with neither header has to be written by hand.
function sendRaw(port: number, requestText: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1')
    let data = ''
    socket.on('data', (chunk) => {
      data += chunk.toString()
    })
    socket.on('end', () => resolve(data))
    socket.on('error', reject)
    socket.write(requestText)
  })
}

function statusOf(raw: string): number {
  const match = /^HTTP\/1\.1 (\d{3})/.exec(raw)
  if (!match) {
    throw new Error(`resposta sem linha de status: ${raw}`)
  }
  return Number(match[1])
}

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

  it.each(['POST', 'PUT', 'PATCH'])(
    'rejects a %s with neither content-length nor transfer-encoding with 411 in the documented shape',
    async (method) => {
      const raw = await sendRaw(port, `${method} /test HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`)
      expect(statusOf(raw)).toBe(411)
      const body = JSON.parse(raw.slice(raw.indexOf('\r\n\r\n') + 4))
      expect(body).toEqual({ error: 'tamanho_obrigatorio', message: 'Informe o tamanho da requisição.' })
    },
  )

  it('accepts a POST with content-length: 0, as browsers send for an empty body', async () => {
    const raw = await sendRaw(port, 'POST /test HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
    expect(statusOf(raw)).toBe(200)
  })

  it('does not require content-length on a bodiless DELETE, as browsers send it', async () => {
    const raw = await sendRaw(port, 'DELETE /test HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n')
    expect(statusOf(raw)).toBe(200)
  })

  it('requires content-length on DELETE endpoints known to read a body (/api/admin/convites)', async () => {
    const raw = await sendRaw(port, 'DELETE /api/admin/convites HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n')
    expect(statusOf(raw)).toBe(411)
    const body = JSON.parse(raw.slice(raw.indexOf('\r\n\r\n') + 4))
    expect(body).toEqual({ error: 'tamanho_obrigatorio', message: 'Informe o tamanho da requisição.' })
  })

  it('rejects an oversized body on DELETE /api/admin/convites with 413', async () => {
    const res = await fetch(`${baseUrl}/api/admin/convites`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: 'a'.repeat(64 * KB + 1),
    })
    expect(res.status).toBe(413)
    const body = await res.json()
    expect(body).toEqual({ error: 'corpo_muito_grande', message: 'A requisição é grande demais.' })
  })

  it('allows a valid body under 64 KB on DELETE /api/admin/convites', async () => {
    const res = await fetch(`${baseUrl}/api/admin/convites`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('does not affect GET requests', async () => {
    const res = await fetch(`${baseUrl}/test`, { method: 'GET' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})
