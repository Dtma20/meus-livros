import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The home page's layout depends on who is asking, and that decision has to be
 * made before either side renders. It used to live in `index.vue`'s `setup()`,
 * which raised NUXT_E2007 and made the server emit the anonymous shell while
 * the client hydrated the member one — every node under `<nav>` mismatched.
 *
 * These tests pin the decision to the middleware. If someone moves it back into
 * a component, the middleware stops existing and they go red.
 */

const layoutCalls: string[] = []
let sessionState: Record<string, unknown> = {}
let meResponse: unknown = null
let meRejects = false

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
  if (meRejects) throw new Error('401')
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
  })

  it('chooses the anonymous shell when /api/users/me rejects', async () => {
    meRejects = true
    await run()
    expect(layoutCalls).toEqual(['default'])
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
    meRejects = true // would throw if the middleware asked
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
      '../../app/pages/@[handle].vue',
    ]

    for (const pageRel of pages) {
      const filePath = path.resolve(__dirname, pageRel)
      const content = fs.readFileSync(filePath, 'utf-8')
      expect(content).toContain("middleware: 'home-layout'")
    }
  })
})
