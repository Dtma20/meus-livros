import { createServer, type Server } from 'node:http'
import { ofetch } from 'ofetch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isTimeoutOrAbort, TIMEOUT_MESSAGE } from '../../app/utils/fetch-error'

/**
 * The regression: every client fetch got `timeout`, and every catch tested
 * `err.name === 'TimeoutError'`. ofetch never throws that — it aborts with that
 * name internally and wraps the result in a `FetchError`. So the branch never
 * fired, a timed-out save fell through to `data?.message ?? '…'`, and because a
 * timed-out request has no body, the user saw the generic fallback copy for
 * what was really a dead connection.
 *
 * The first two cases drive a real ofetch timeout against a local socket that
 * accepts and then says nothing, so they assert ofetch's actual error shape
 * rather than a hand-written imitation of it. Reading the source and guessing
 * the shape one layer too high is what produced the bug.
 */
describe('isTimeoutOrAbort', () => {
  let server: Server
  let url: string

  beforeAll(async () => {
    // Accepts the connection and never answers, which is what a lost request
    // looks like from the client: no response, no close.
    server = createServer(() => {})
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    url = `http://127.0.0.1:${port}/`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  })

  it('a real ofetch timeout does not carry TimeoutError on the error itself', async () => {
    const err = await ofetch(url, { timeout: 100, retry: 0 }).catch((e: unknown) => e)

    // This is the assertion that explains the bug: the naive check is false.
    expect((err as { name?: string }).name).toBe('FetchError')
    expect((err as { name?: string }).name).not.toBe('TimeoutError')
    // And a timed-out request has no body to read a message out of.
    expect((err as { data?: unknown }).data).toBeUndefined()
  })

  it('recognises a real ofetch timeout through the cause chain', async () => {
    const err = await ofetch(url, { timeout: 100, retry: 0 }).catch((e: unknown) => e)
    expect(isTimeoutOrAbort(err)).toBe(true)
  })

  it('recognises an AbortController abort', async () => {
    const controller = new AbortController()
    const promise = ofetch(url, { signal: controller.signal, retry: 0 }).catch((e: unknown) => e)
    controller.abort()
    expect(isTimeoutOrAbort(await promise)).toBe(true)
  })

  it('does not fire on an ordinary server error', () => {
    const err = Object.assign(new Error('[POST] "/api/logs": 500'), {
      name: 'FetchError',
      data: { error: 'erro_inesperado', message: 'Não foi possível completar a operação.' },
    })
    expect(isTimeoutOrAbort(err)).toBe(false)
  })

  it('does not fire on null, undefined or a plain string', () => {
    expect(isTimeoutOrAbort(null)).toBe(false)
    expect(isTimeoutOrAbort(undefined)).toBe(false)
    expect(isTimeoutOrAbort('boom')).toBe(false)
  })

  it('terminates on a self-referencing cause chain', () => {
    const err: { name: string, cause?: unknown } = { name: 'FetchError' }
    err.cause = err
    expect(isTimeoutOrAbort(err)).toBe(false)
  })

  it('exports one pt-BR message for the copy to stay identical across forms', () => {
    expect(TIMEOUT_MESSAGE).toBe('A conexão demorou demais. Verifique sua internet e tente de novo.')
  })
})
