// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const layoutCalls: string[] = []
let sessionState: Record<string, unknown> = {}
let meResponse: unknown = null
let meRejects = false
let meError: unknown = Object.assign(new Error('401'), { statusCode: 401 })
let meResponses: unknown[] = []
let meFetches = 0

vi.hoisted(() => {
  const globalScope = globalThis as unknown as Record<string, unknown>
  globalScope.defineNuxtRouteMiddleware = (fn: unknown) => fn
  globalScope.useNuxtApp = () => ({ runWithContext: (fn: () => unknown) => fn() })
})

const globalScope = globalThis as unknown as Record<string, unknown>

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
  if (meResponses.length > 0) {
    const response = meResponses.shift()
    if (response instanceof Error) throw response
    return response
  }
  if (meRejects) throw meError
  return meResponse
}

const { default: homeLayoutMiddleware } = await import('../../app/middleware/home-layout')

type MiddlewareHandler = () => Promise<unknown> | unknown
const run = homeLayoutMiddleware as unknown as MiddlewareHandler

describe('home-layout middleware', () => {
  beforeEach(() => {
    layoutCalls.length = 0
    sessionState = {}
    meResponse = null
    meRejects = false
    meError = Object.assign(new Error('401'), { statusCode: 401 })
    meResponses = []
    meFetches = 0
  })

  it('chooses the anonymous shell and caches a 401 response', async () => {
    meRejects = true
    await run()
    expect(layoutCalls).toEqual(['default'])
    expect((sessionState['auth:session'] as { fetched?: boolean }).fetched).toBe(true)
  })

  it('retries the session lookup after a temporary failure', async () => {
    meResponses = [
      Object.assign(new Error('HTTP 503'), { statusCode: 503 }),
      { id: 'u1', handle: 'dtma23', display_name: 'Diogo' },
    ]

    await run()
    expect(layoutCalls).toEqual(['default'])
    expect((sessionState['auth:session'] as { fetched?: boolean }).fetched).toBe(false)

    await run()

    expect(meFetches).toBe(2)
    expect(layoutCalls).toEqual(['default', 'app'])
    expect(sessionState['auth:session']).toMatchObject({ user: { id: 'u1' }, fetched: true })
  })

  it('chooses the anonymous shell for a verified identity with no profile', async () => {
    meResponse = null
    await run()
    expect(layoutCalls).toEqual(['default'])
  })

  it('chooses the member shell for a profile', async () => {
    meResponse = { id: 'u1', handle: 'dtma23', display_name: 'Diogo' }
    await run()
    expect(layoutCalls).toEqual(['app'])
  })

  it('reuses an already-fetched session instead of asking again', async () => {
    sessionState['auth:session'] = {
      user: { handle: 'dtma23', hasProfile: true },
      hasProfile: true,
      fetched: true,
    }
    meRejects = true
    await run()
    expect(layoutCalls).toEqual(['app'])
  })

  it('stores the resolved session under auth:session for the page to read', async () => {
    meResponse = { id: 'u1', handle: 'dtma23' }
    await run()
    const stored = sessionState['auth:session'] as { hasProfile?: boolean, fetched?: boolean }
    expect(stored.hasProfile).toBe(true)
    expect(stored.fetched).toBe(true)
  })

  it('is declared as middleware on public pages (index, entrada, livro, @handle)', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const pages = [
      '../../app/pages/index.vue',
      '../../app/pages/entrada/[id].vue',
      '../../app/pages/livro/[slug].vue',
      '../../app/pages/@[handle]/index.vue',
    ]

    for (const pageRel of pages) {
      const filePath = path.resolve(__dirname, pageRel)
      const content = fs.readFileSync(filePath, 'utf-8')
      expect(content).toContain("middleware: 'home-layout'")
    }
  })
})
