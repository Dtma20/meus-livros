import { describe, expect, it } from 'vitest'
import { createError, type H3Event } from 'h3'
import { z } from 'zod'
import { defineApiHandler, parseOrThrow } from '../../server/utils/api'

function createMockEvent(overrides: Partial<H3Event> = {}): H3Event {
  const headers = new Map<string, string>()
  const responseHeaders = new Map<string, string>()

  const context: Record<string, unknown> = {}

  return {
    method: 'GET',
    path: '/api/test',
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

describe('API Handler (defineApiHandler)', () => {
  it('generates a new Request ID when not provided and attaches to response', async () => {
    const event = createMockEvent()
    const handler = defineApiHandler(async () => ({ ok: true }))

    const result = await handler(event)

    expect(result).toEqual({ ok: true })
    const requestId = event.node.res.getHeader('x-request-id')
    expect(requestId).toBeDefined()
    expect(typeof requestId).toBe('string')
    expect((requestId as string).length).toBeGreaterThan(10)
  })

  it('preserves existing x-request-id from incoming request', async () => {
    const event = createMockEvent()
    event.context.requestId = 'custom-request-id-999'
    const handler = defineApiHandler(async () => ({ ok: true }))

    await handler(event)

    expect(event.node.res.getHeader('x-request-id')).toBe('custom-request-id-999')
  })

  it('captures handled H3Error (e.g. 404) and returns documented shape with requestId', async () => {
    const event = createMockEvent()
    const handler = defineApiHandler(async () => {
      throw createError({
        statusCode: 404,
        data: { error: 'nao_encontrado', message: 'Item não encontrado.' },
      })
    })

    const result = (await handler(event)) as { error: string; message: string; requestId?: string }

    expect(event.node.res.statusCode).toBe(404)
    expect(result.error).toBe('nao_encontrado')
    expect(result.message).toBe('Item não encontrado.')
    expect(result.requestId).toBeDefined()
  })

  it('maps Postgres unique violation (code 23505) to 409 conflito', async () => {
    const event = createMockEvent()
    const pgError = new Error('duplicate key value violates unique constraint')
    ;(pgError as unknown as { name: string; code: string; routine: string }).name = 'PostgresError'
    ;(pgError as unknown as { code: string }).code = '23505'
    ;(pgError as unknown as { routine: string }).routine = '_bt_check_unique'

    const handler = defineApiHandler(async () => {
      throw pgError
    })

    const result = (await handler(event)) as { error: string; message: string; requestId?: string }

    expect(event.node.res.statusCode).toBe(409)
    expect(result.error).toBe('conflito')
    expect(result.message).toBe('O registro já existe no sistema.')
    expect(result.requestId).toBeDefined()
  })

  it('maps Postgres foreign key violation (code 23503) to 400 referencia_invalida', async () => {
    const event = createMockEvent()
    const pgError = new Error('violates foreign key constraint')
    ;(pgError as unknown as { name: string; code: string; routine: string }).name = 'PostgresError'
    ;(pgError as unknown as { code: string }).code = '23503'
    ;(pgError as unknown as { routine: string }).routine = 'ri_ReportViolation'

    const handler = defineApiHandler(async () => {
      throw pgError
    })

    const result = (await handler(event)) as { error: string; message: string; requestId?: string }

    expect(event.node.res.statusCode).toBe(400)
    expect(result.error).toBe('referencia_invalida')
    expect(result.message).toBe('Referência a recurso inexistente.')
    expect(result.requestId).toBeDefined()
  })

  it('maps Postgres statement timeout (code 57014) to 504 tempo_esgotado', async () => {
    const event = createMockEvent()
    const pgError = new Error('canceling statement due to statement timeout')
    ;(pgError as unknown as { name: string; code: string; routine: string }).name = 'PostgresError'
    ;(pgError as unknown as { code: string }).code = '57014'
    ;(pgError as unknown as { routine: string }).routine = 'ProcessInterrupts'

    const handler = defineApiHandler(async () => {
      throw pgError
    })

    const result = (await handler(event)) as { error: string; message: string; requestId?: string }

    expect(event.node.res.statusCode).toBe(504)
    expect(result.error).toBe('tempo_esgotado')
    expect(result.message).toBe('A operação no banco de dados demorou demais.')
    expect(result.requestId).toBeDefined()
  })

  it('never leaks internal stack traces or raw messages on unhandled 500 errors', async () => {
    const event = createMockEvent()
    const handler = defineApiHandler(async () => {
      throw new Error('SELECT * FROM secret_table WHERE root_password = "leak"')
    })

    const result = (await handler(event)) as { error: string; message: string; requestId?: string }

    expect(event.node.res.statusCode).toBe(500)
    expect(result.error).toBe('erro_inesperado')
    expect(result.message).toBe('Não foi possível completar a operação.')
    expect(JSON.stringify(result)).not.toContain('secret_table')
    expect(JSON.stringify(result)).not.toContain('root_password')
    expect(result.requestId).toBeDefined()
  })

  it('parseOrThrow returns parsed data or throws formatted 400 error', () => {
    const schema = z.object({
      title: z.string().min(3),
      pages: z.number().int().positive(),
    })

    const valid = parseOrThrow(schema, { title: 'Livro Bom', pages: 200 })
    expect(valid).toEqual({ title: 'Livro Bom', pages: 200 })

    expect(() => {
      parseOrThrow(schema, { title: 'ab', pages: -5 })
    }).toThrow()
  })
})
