import { createServer, type Server } from 'node:http'
import { createApp, createError, toNodeListener } from 'h3'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ provider: vi.fn(), cover: vi.fn(), limit: vi.fn(), user: { id: 'user-1' } as { id: string } | null }))
vi.mock('ofetch', () => ({ $fetch: mocks.provider }))
vi.mock('../../server/services/isbn-cover', () => ({ findIsbnCover: mocks.cover }))
vi.mock('../../server/services/rate-limit', () => ({ checkRateLimit: mocks.limit }))
vi.mock('../../server/utils/session', () => ({ requireSessionUser: async () => {
  if (!mocks.user) throw createError({ statusCode: 401 })
  return mocks.user
} }))

describe('authenticated ISBN lookup', () => {
  let server: Server
  let url: string
  beforeAll(async () => {
    const handler = (await import('../../server/api/isbn.get')).default
    const app = createApp().use(handler)
    server = createServer(toNodeListener(app))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing address')
    url = `http://127.0.0.1:${address.port}`
  })
  afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())) })
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.user = { id: 'user-1' }
    mocks.limit.mockResolvedValue(true)
    mocks.cover.mockResolvedValue(null)
    mocks.provider.mockResolvedValue({ title: ' Livro ', authors: [' Autora ', 'autora'], publisher: ' Editora ', page_count: 250, year: 2019, cover_url: 'https://example.com/cover.jpg', synopsis: 'ignored' })
  })
  it('rejects anonymous and invalid requests before contacting the provider', async () => {
    mocks.user = null
    expect((await fetch(`${url}?isbn=9788535902778`)).status).toBe(401)
    mocks.user = { id: 'user-1' }
    for (const isbn of ['bad', '9788535902779', '9788535902778.0', '0000000000000', '']) {
      expect((await fetch(`${url}?isbn=${isbn}`)).status).toBe(400)
    }
    expect(mocks.provider).not.toHaveBeenCalled()
    expect(mocks.cover).not.toHaveBeenCalled()
  })
  it('normalizes formatted ISBN-10 with X and returns only validated fields', async () => {
    const response = await fetch(`${url}?isbn=85-325-1166-X`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'found', data: { title: 'Livro', authors: ['Autora'], publisher: 'Editora', page_count: 250, year: 2019, cover_url: 'https://example.com/cover.jpg' } })
    expect(mocks.provider).toHaveBeenCalledWith('https://brasilapi.com.br/api/isbn/v1/9788532511669', { timeout: 8000, retry: 0 })
  })
  it('discards absent and invalid fields without coercion', async () => {
    mocks.provider.mockResolvedValue({ title: null, authors: [' ', 17, 'Valid'], publisher: 'x'.repeat(201), page_count: 2.5, year: '2020', cover_url: 'http://example.com/a' })
    expect(await (await fetch(`${url}?isbn=9788535902778`)).json()).toEqual({ status: 'found', data: { authors: ['Valid'] } })
  })
  it('keeps provider not-found separate from operational failures and malformed bodies', async () => {
    mocks.provider.mockRejectedValueOnce({ statusCode: 404 })
    expect(await (await fetch(`${url}?isbn=9788535902778`)).json()).toEqual({ status: 'not_found' })
    for (const error of [{ statusCode: 500 }, { name: 'TimeoutError' }]) {
      mocks.provider.mockRejectedValueOnce(error)
      expect((await fetch(`${url}?isbn=9788535902778`)).status).toBe(502)
    }
    mocks.provider.mockResolvedValueOnce(null)
    expect((await fetch(`${url}?isbn=9788535902778`)).status).toBe(502)
  })
  it('enforces the existing user rate limiter', async () => {
    mocks.limit.mockResolvedValue(false)
    expect((await fetch(`${url}?isbn=9788535902778`)).status).toBe(429)
    expect(mocks.limit).toHaveBeenCalledWith('isbn:user:user-1', 60)
    expect(mocks.provider).not.toHaveBeenCalled()
    expect(mocks.cover).not.toHaveBeenCalled()
  })

  it('starts cover enrichment in parallel and fills only a missing cover', async () => {
    let finishCover!: (cover: string | null) => void
    let finishBook!: (value: unknown) => void
    mocks.cover.mockImplementation(() => new Promise(resolve => { finishCover = resolve }))
    mocks.provider.mockImplementation(() => new Promise(resolve => { finishBook = resolve }))
    const responsePromise = fetch(`${url}?isbn=9788535902778`)
    await vi.waitFor(() => expect(mocks.cover).toHaveBeenCalledTimes(1))
    expect(mocks.provider).toHaveBeenCalledTimes(1)
    finishCover('https://example.com/extra.jpg')
    finishBook({ title: 'Livro' })
    const response = await responsePromise
    expect(await response.json()).toEqual({ status: 'found', data: { title: 'Livro', cover_url: 'https://example.com/extra.jpg' } })
    expect(mocks.cover.mock.calls[0]?.[1].aborted).toBe(true)
  })

  it('does not wait for enrichment when BrasilAPI already supplied a valid cover', async () => {
    mocks.cover.mockImplementation(() => new Promise(() => {}))
    const response = await fetch(`${url}?isbn=9788535902778`)
    expect((await response.json()).data.cover_url).toBe('https://example.com/cover.jpg')
    expect(mocks.cover.mock.calls[0]?.[1].aborted).toBe(true)
  })

  it('keeps metadata when the optional cover service fails', async () => {
    mocks.cover.mockRejectedValue(new Error('unavailable'))
    mocks.provider.mockResolvedValue({ title: 'Livro', authors: ['Autora'] })
    const response = await fetch(`${url}?isbn=9788535902778`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'found', data: { title: 'Livro', authors: ['Autora'] } })
  })
})
