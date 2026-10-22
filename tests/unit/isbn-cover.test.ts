import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findIsbnCover } from '../../server/services/isbn-cover'

const request = vi.hoisted(() => vi.fn())
vi.mock('ofetch', () => ({ $fetch: request }))
const isbn = '9788579606342'

describe('ISBN cover enrichment', () => {
  beforeEach(() => { request.mockReset() })
  afterEach(() => { vi.useRealTimers() })

  it('accepts only an HTTPS cover attached to the requested ISBN', async () => {
    request.mockImplementation(async (_url, options) => {
      if (options.query?.providers === 'google-books') return { isbn: '8579606349', cover_url: 'https://example.com/cover.jpg' }
      throw new Error('unavailable')
    })
    expect(await findIsbnCover(isbn, new AbortController().signal)).toBe('https://example.com/cover.jpg')
    expect(request).toHaveBeenCalledTimes(3)
    for (const [, options] of request.mock.calls) {
      expect(options).toMatchObject({ timeout: 2500, retry: 0, signal: expect.any(AbortSignal) })
    }
  })

  it('races the sources and uses a matching Open Library edition cover ID', async () => {
    const pending: Array<(value: unknown) => void> = []
    request.mockImplementation((url) => url.startsWith('https://openlibrary.org/')
      ? Promise.resolve({ isbn_13: [isbn], covers: [-1, 6429406] })
      : new Promise(resolve => pending.push(resolve)))
    expect(await findIsbnCover(isbn, new AbortController().signal)).toBe('https://covers.openlibrary.org/b/id/6429406-L.jpg?default=false')
    expect(pending).toHaveLength(2)
  })

  it('rejects mismatched editions, malformed bodies and insecure images', async () => {
    request.mockImplementation(async (url, options) => {
      if (url.startsWith('https://openlibrary.org/')) return { isbn_13: ['9788535902778'], covers: [123] }
      if (options.query?.providers === 'google-books') return { isbn, cover_url: 'http://example.com/cover.jpg' }
      return { isbn: '9788535902778', cover_url: 'https://example.com/wrong.jpg' }
    })
    expect(await findIsbnCover(isbn, new AbortController().signal)).toBeNull()
    request.mockResolvedValue(null)
    expect(await findIsbnCover(isbn, new AbortController().signal)).toBeNull()
  })

  it('turns timeout, quota and not-found failures into an optional missing cover', async () => {
    request.mockRejectedValue({ statusCode: 429 })
    expect(await findIsbnCover(isbn, new AbortController().signal)).toBeNull()
  })

  it('stops at 2.5 seconds even when all sources stall and cancels their requests', async () => {
    vi.useFakeTimers()
    request.mockImplementation(() => new Promise(() => {}))
    const result = findIsbnCover(isbn, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(2500)
    expect(await result).toBeNull()
    expect(request.mock.calls.every(([, options]) => options.signal.aborted)).toBe(true)
  }, 1000)

  it('cancels the losing sources as soon as a cover is found', async () => {
    request.mockImplementation(async (url) => url.startsWith('https://openlibrary.org/')
      ? { isbn_10: ['8579606349'], covers: [12] }
      : new Promise(() => {}))
    expect(await findIsbnCover(isbn, new AbortController().signal)).toContain('/12-L.jpg')
    expect(request.mock.calls.every(([, options]) => options.signal.aborted)).toBe(true)
  })

  it('stops immediately when the parent lookup is cancelled', async () => {
    request.mockImplementation(() => new Promise(() => {}))
    const parent = new AbortController()
    const result = findIsbnCover(isbn, parent.signal)
    parent.abort()
    expect(await result).toBeNull()
    expect(request.mock.calls.every(([, options]) => options.signal.aborted)).toBe(true)
  })
})
