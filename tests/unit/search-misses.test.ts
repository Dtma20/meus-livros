import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

import searchHandler from '../../server/api/search/index.get'
import { recordSearchMiss } from '../../server/services/search'
import { logger } from '../../server/utils/logger'
import { searchQuerySchema } from '../../shared/schemas/search'

const mockInsert = vi.fn()
const mockValues = vi.fn()

vi.mock('../../server/db', () => ({
  db: {
    insert: (...args: unknown[]) => {
      mockInsert(...args)
      return {
        values: (...valArgs: unknown[]) => mockValues(...valArgs),
      }
    },
  },
}))

const rateLimitMap = new Map<string, number>()

vi.mock('../../server/services/rate-limit', () => ({
  checkRateLimit: vi.fn(async (key: string, limit: number) => {
    const current = (rateLimitMap.get(key) ?? 0) + 1
    rateLimitMap.set(key, current)
    return current <= limit
  }),
}))

let mockSessionUser: { id: string } | null = null

vi.mock('../../server/utils/session', () => ({
  getSessionUser: vi.fn(async () => mockSessionUser),
  requireSessionUser: vi.fn(async () => {
    if (!mockSessionUser) throw new Error('Não autorizado')
    return mockSessionUser
  }),
}))

vi.mock('../../server/services/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/search')>()
  return {
    ...actual,
    searchWorks: vi.fn(async () => []),
  }
})

function createSearchMockEvent(path: string, ip = '127.0.0.1'): H3Event {
  const headers = new Map<string, string>([['x-forwarded-for', ip]])
  const responseHeaders = new Map<string, string>()

  return {
    method: 'GET',
    path,
    headers: {
      get: (key: string) => headers.get(key.toLowerCase()) || null,
    },
    node: {
      req: {
        headers: { 'x-forwarded-for': ip },
      },
      res: {
        statusCode: 200,
        setHeader: (name: string, value: string) => responseHeaders.set(name.toLowerCase(), value),
        getHeader: (name: string) => responseHeaders.get(name.toLowerCase()),
      },
    },
    context: {},
  } as unknown as H3Event
}

describe('TASK-026: recordSearchMiss (unit)', () => {
  beforeEach(() => {
    mockInsert.mockClear()
    mockValues.mockClear()
  })

  it('ignores queries with length less than 2 characters (empty or single char)', async () => {
    await recordSearchMiss('')
    await recordSearchMiss('a')
    await recordSearchMiss('   ')
    await recordSearchMiss('  b  ')

    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockValues).not.toHaveBeenCalled()
  })

  it('trims query whitespace but preserves casing and accents without normalisation', async () => {
    mockValues.mockResolvedValueOnce([{ id: 1 }])

    await recordSearchMiss('  O Senhor dos Anéis (Edição Ilustrada)  ', 'user-123')

    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(mockValues).toHaveBeenCalledWith({
      query: 'O Senhor dos Anéis (Edição Ilustrada)',
      user_id: 'user-123',
    })
  })

  it('records null user_id for anonymous searches', async () => {
    mockValues.mockResolvedValueOnce([{ id: 2 }])

    await recordSearchMiss('Crime e Castigo')

    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(mockValues).toHaveBeenCalledWith({
      query: 'Crime e Castigo',
      user_id: null,
    })
  })

  it('catches and logs error when insert fails without rejecting or throwing', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
    mockValues.mockRejectedValueOnce(new Error('Connection failure'))

    await expect(recordSearchMiss('Falha Simulada', null)).resolves.not.toThrow()

    expect(errorSpy).toHaveBeenCalledWith(
      'search_misses insert failed',
      expect.objectContaining({ module: 'search', source: 'database' }),
    )
    errorSpy.mockRestore()
  })
})

describe('TASK-026: searchQuerySchema (unit)', () => {
  it('trims leading and trailing whitespace from query', () => {
    const parsed = searchQuerySchema.parse({ q: '  Ensaio sobre a Cegueira  ' })
    expect(parsed.q).toBe('Ensaio sobre a Cegueira')
  })

  it('defaults to empty string when q is missing', () => {
    const parsed = searchQuerySchema.parse({})
    expect(parsed.q).toBe('')
  })

  it('accepts queries up to 100 characters', () => {
    const result = searchQuerySchema.safeParse({ q: 'a'.repeat(100) })
    expect(result.success).toBe(true)
  })

  it('rejects queries longer than 100 characters', () => {
    const result = searchQuerySchema.safeParse({ q: 'a'.repeat(101) })
    expect(result.success).toBe(false)
  })
})

describe('TASK-068: search misses rate limiting on GET /api/search', () => {
  beforeEach(() => {
    mockInsert.mockClear()
    mockValues.mockClear()
    mockValues.mockResolvedValue([{ id: 1 }])
    rateLimitMap.clear()
    mockSessionUser = null
  })

  it('bounds anonymous misses to 30 per IP while keeping signed-in viewers unlimited', async () => {
    const ip = '198.51.100.42'
    const responses: unknown[] = []

    for (let i = 1; i <= 31; i++) {
      const event = createSearchMockEvent('/api/search?q=termoinexistente', ip)
      const res = await searchHandler(event)
      responses.push(res)
    }

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(mockValues).toHaveBeenCalledTimes(30)
    for (const res of responses) {
      expect(res).toEqual({ works: [] })
    }

    mockSessionUser = { id: '00000000-0000-0000-0000-000000000001' }
    const signedInEvent = createSearchMockEvent('/api/search?q=termoinexistente', ip)
    const signedInRes = await searchHandler(signedInEvent)

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(mockValues).toHaveBeenCalledTimes(31)
    expect(mockValues).toHaveBeenLastCalledWith({
      query: 'termoinexistente',
      user_id: '00000000-0000-0000-0000-000000000001',
    })
    expect(signedInRes).toEqual({ works: [] })
  })

  it('returns the same response body whether or not the miss was recorded', async () => {
    const ip = '198.51.100.99'
    const event1 = createSearchMockEvent('/api/search?q=inexistente', ip)
    const res1 = await searchHandler(event1)

    for (let i = 2; i <= 30; i++) {
      const ev = createSearchMockEvent('/api/search?q=inexistente', ip)
      await searchHandler(ev)
    }

    const event31 = createSearchMockEvent('/api/search?q=inexistente', ip)
    const res31 = await searchHandler(event31)

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(res1).toEqual({ works: [] })
    expect(res31).toEqual({ works: [] })
    expect(res1).toEqual(res31)
  })
})
