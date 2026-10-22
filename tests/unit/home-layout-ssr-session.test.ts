// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'

const SESSION_COOKIE = '__Secure-better-auth.session_token=token-de-teste'

const layoutCalls: string[] = []
let sessionState: Record<string, unknown> = {}
let meFetches = 0
// The request event Nuxt exposes through nuxtApp.ssrContext; undefined on the client.
let ssrEvent: H3Event | undefined

const globalScope = globalThis as unknown as Record<string, unknown>
globalScope.defineNuxtRouteMiddleware = (fn: unknown) => fn
globalScope.useNuxtApp = () => ({
  runWithContext: (fn: () => unknown) => fn(),
  ssrContext: ssrEvent ? { event: ssrEvent } : undefined,
})
globalScope.setPageLayout = (name: string) => {
  layoutCalls.push(name)
}
globalScope.useState = (key: string, init?: () => unknown) => {
  if (!(key in sessionState)) {
    sessionState[key] = init ? init() : null
  }
  return {
    get value() {
      return sessionState[key]
    },
    set value(next: unknown) {
      sessionState[key] = next
    },
  }
}
globalScope.$fetch = async () => null
globalScope.useRequestFetch = () => async () => {
  meFetches++
  return { id: 'u1', handle: 'dtma23', display_name: 'Diogo' }
}

const { default: homeLayoutMiddleware } = await import('../../app/middleware/home-layout')

type MiddlewareHandler = () => Promise<unknown> | unknown
const run = homeLayoutMiddleware as unknown as MiddlewareHandler

function serverEvent(cookie?: string): H3Event {
  const headers: Record<string, string> = cookie ? { cookie } : {}
  return { node: { req: { headers } } } as unknown as H3Event
}

describe('home-layout middleware during SSR', () => {
  beforeEach(() => {
    layoutCalls.length = 0
    sessionState = {}
    meFetches = 0
    ssrEvent = undefined
  })

  it('does not mark the session fetched for a cookie-less SSR response', async () => {
    ssrEvent = serverEvent()
    await run()

    expect(meFetches).toBe(0)
    expect(layoutCalls).toEqual(['default'])
    const stored = sessionState['auth:session'] as { fetched?: boolean } | undefined
    expect(stored?.fetched).not.toBe(true)
  })

  it('still resolves the session during SSR when the request carries the session cookie', async () => {
    ssrEvent = serverEvent(SESSION_COOKIE)
    await run()

    expect(meFetches).toBe(1)
    expect(layoutCalls).toEqual(['app'])
    const stored = sessionState['auth:session'] as { fetched?: boolean, hasProfile?: boolean }
    expect(stored.fetched).toBe(true)
    expect(stored.hasProfile).toBe(true)
  })

  it('does not treat another cookie as the session', async () => {
    ssrEvent = serverEvent('outro=1')
    await run()

    expect(meFetches).toBe(0)
    expect(layoutCalls).toEqual(['default'])
  })

  it('on the client (no SSR event) fetches the session as before', async () => {
    ssrEvent = undefined
    await run()

    expect(meFetches).toBe(1)
    const stored = sessionState['auth:session'] as { fetched?: boolean }
    expect(stored.fetched).toBe(true)
  })
})
