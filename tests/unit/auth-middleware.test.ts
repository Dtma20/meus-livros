import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { getSafeRedirectUrl } from '../../app/utils/redirect'

const navigateTo = vi.hoisted(() => vi.fn((path: string) => path))

vi.hoisted(() => {
  const scope = globalThis as unknown as Record<string, unknown>
  scope.defineNuxtRouteMiddleware = (handler: unknown) => handler
  scope.navigateTo = navigateTo
  scope.useState = (_key: string, init?: () => unknown) => ref(init ? init() : null)
  scope.useNuxtApp = () => ({ runWithContext: (fn: () => unknown) => fn() })
  scope.useRequestFetch = () => () => Promise.reject(new Error('not expected'))
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
})
