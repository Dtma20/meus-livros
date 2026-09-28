import { describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import clientErrorsHandler from '../../server/api/observability/client-errors.post'
import { sanitizeClientErrorMessage, sanitizeClientErrorStack } from '../../server/utils/client-error'

let mockRequestBody: unknown = null

vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>()
  return {
    ...actual,
    readBody: vi.fn(async () => mockRequestBody),
  }
})

vi.mock('../../server/services/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue(true),
}))

function createMockEvent(overrides: Partial<H3Event> = {}): H3Event {
  const headers = new Map<string, string>()
  const responseHeaders = new Map<string, string>()
  const context: Record<string, unknown> = {}

  return {
    method: 'POST',
    path: '/api/observability/client-errors',
    headers: {
      get: (key: string) => headers.get(key.toLowerCase()) || null,
    },
    node: {
      req: {
        headers: {},
      },
      res: {
        statusCode: 200,
        setHeader: (name: string, value: string) => responseHeaders.set(name.toLowerCase(), value),
        getHeader: (name: string) => responseHeaders.get(name.toLowerCase()),
      },
    },
    context,
    ...overrides,
  } as unknown as H3Event
}

describe('sanitizeClientErrorMessage', () => {
  it('replaces line breaks before composing log messages', () => {
    expect(sanitizeClientErrorMessage('linha 1\r\nlinha 2\nlinha 3')).toBe('linha 1 linha 2 linha 3')
  })
})

describe('sanitizeClientErrorStack', () => {
  it('keeps the stack readable across lines', () => {
    const stack = 'Error: falhou\n    at foo (app.js:1:1)\n    at bar (app.js:2:2)'

    expect(sanitizeClientErrorStack(stack)).toBe(
      'Error: falhou\n  at foo (app.js:1:1)\n  at bar (app.js:2:2)',
    )
  })

  it('indents every line so a forged entry cannot start at column zero', () => {
    const forged = 'Error: real\n[09:00:00] [ERROR] [auth] entrada forjada'

    const lines = sanitizeClientErrorStack(forged).split('\n')

    expect(lines).toHaveLength(2)
    expect(lines[1]).toBe('  [09:00:00] [ERROR] [auth] entrada forjada')
  })

  it('indents after a lone carriage return, which also returns the cursor to column zero', () => {
    const forged = 'Error: real\r[09:00:00] [ERROR] [auth] entrada forjada'

    expect(sanitizeClientErrorStack(forged)).not.toContain('\r')
    expect(sanitizeClientErrorStack(forged).split('\n')[1]).toBe(
      '  [09:00:00] [ERROR] [auth] entrada forjada',
    )
  })

  it('caps the number of lines kept', () => {
    const huge = Array.from({ length: 200 }, (_, i) => `at frame${i} (app.js:${i}:1)`).join('\n')

    expect(sanitizeClientErrorStack(huge).split('\n')).toHaveLength(50)
  })
})

describe('POST /api/observability/client-errors route', () => {
  it('drops _rawError from client context and produces console.error with single line argument', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const event = createMockEvent()
    mockRequestBody = {
      message: 'erro no cliente',
      context: {
        _rawError: 'forjado\n[00:00] [ERROR] linha injetada',
        foo: 'bar',
      },
    }

    const result = await clientErrorsHandler(event)

    expect(result).toEqual({ ok: true })
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy.mock.calls[0]).toHaveLength(1)
    const formattedLine = consoleErrorSpy.mock.calls[0]![0] as string
    expect(formattedLine).not.toContain('forjado\n')
    expect(formattedLine).not.toContain('forjado')

    consoleErrorSpy.mockRestore()
  })
})
