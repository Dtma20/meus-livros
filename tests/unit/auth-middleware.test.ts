import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSafeRedirectUrl } from '../../app/utils/redirect'

const navigateTo = vi.hoisted(() => vi.fn((path: string) => path))
const authHarness = vi.hoisted(() => {
  const state = { value: undefined as unknown }
  const responses: unknown[] = []
  const harness = { state, responses, fetchCount: 0 }

  const scope = globalThis as unknown as Record<string, unknown>
  scope.defineNuxtRouteMiddleware = (handler: unknown) => handler
  scope.navigateTo = navigateTo
  scope.useState = (_key: string, init?: () => unknown) => {
    if (state.value === undefined) state.value = init ? init() : null
    return {
      get value() { return state.value },
      set value(next: unknown) { state.value = next },
    }
  }
  scope.useNuxtApp = () => ({ runWithContext: (fn: () => unknown) => fn() })
  scope.$fetch = async () => null
  scope.useRequestFetch = () => async () => {
    harness.fetchCount++
    const response = responses.shift()
    if (response instanceof Error) throw response
    if (response === undefined) throw new Error('not expected')
    return response
  }

  return harness
})

function statusError(statusCode: number): Error {
  return Object.assign(new Error(`HTTP ${statusCode}`), { statusCode })
}

beforeEach(() => {
  navigateTo.mockClear()
  authHarness.state.value = undefined
  authHarness.responses.length = 0
  authHarness.fetchCount = 0
})

type AuthMiddleware = (to: { path: string, fullPath: string }) => unknown

describe('auth middleware redirect', () => {
  it('encodes the full path so the query string survives the trip through /entrar', async () => {
    const middleware = (await import('../../app/middleware/auth')).default as unknown as AuthMiddleware

    await middleware({ path: '/app/livro/novo', fullPath: '/app/livro/novo?q=x&ret=y' })

    const target = navigateTo.mock.calls.at(-1)?.[0] ?? ''
    const next = new URL(target, 'http://localhost').searchParams.get('next')
    expect(next).toBe('/app/livro/novo?q=x&ret=y')
  })

  it('keeps the decoded path accepted by the redirect guard after sign-in', async () => {
    const middleware = (await import('../../app/middleware/auth')).default as unknown as AuthMiddleware

    await middleware({ path: '/app/livro/novo', fullPath: '/app/livro/novo?q=x&ret=y' })

    const target = navigateTo.mock.calls.at(-1)?.[0] ?? ''
    const next = new URL(target, 'http://localhost').searchParams.get('next')
    expect(getSafeRedirectUrl(next)).toBe('/app/livro/novo?q=x&ret=y')
  })

  it('retries the session lookup after a temporary failure', async () => {
    const middleware = (await import('../../app/middleware/auth')).default as unknown as AuthMiddleware
    authHarness.responses.push(
      statusError(503),
      { id: 'u1', handle: 'dtma23' },
    )

    await middleware({ path: '/app/livro/novo', fullPath: '/app/livro/novo' })
    expect(navigateTo).toHaveBeenCalledTimes(1)
    expect(authHarness.state.value).toMatchObject({ user: null, fetched: false })

    await middleware({ path: '/app/livro/novo', fullPath: '/app/livro/novo' })

    expect(authHarness.fetchCount).toBe(2)
    expect(authHarness.state.value).toMatchObject({ user: { id: 'u1' }, fetched: true })
    expect(navigateTo).toHaveBeenCalledTimes(1)
  })

  it('does not retry a session lookup after a 401 response', async () => {
    const middleware = (await import('../../app/middleware/auth')).default as unknown as AuthMiddleware
    authHarness.responses.push(statusError(401))

    await middleware({ path: '/app/livro/novo', fullPath: '/app/livro/novo' })
    await middleware({ path: '/app/livro/novo', fullPath: '/app/livro/novo' })

    expect(authHarness.fetchCount).toBe(1)
    expect(authHarness.state.value).toMatchObject({ user: null, fetched: true })
  })
})
