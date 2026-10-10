// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, Suspense } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import EditEntryPage from '../../app/pages/app/entrada/[id]/editar.vue'

const LOG_ID = '11111111-1111-4111-8111-111111111111'
const WORK_SLUG = 'livro-teste'

// Fetch the page uses inside useAsyncData. requestFetch forwards the request cookies on the server; $fetch does not.
const requestFetch = vi.fn()
const globalFetch = vi.fn()
const asyncHandlers: Array<() => unknown> = []

beforeEach(() => {
  asyncHandlers.length = 0
  requestFetch.mockReset()
  globalFetch.mockReset()
  requestFetch.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/logs/')) return { id: LOG_ID, work: { slug: WORK_SLUG } }
    return { slug: WORK_SLUG, title: 'Livro Teste', editions: [] }
  })
  globalFetch.mockResolvedValue(null)

  const globals = globalThis as unknown as Record<string, unknown>
  globals.defineNuxtRouteMiddleware = (fn: unknown) => fn
  globals.definePageMeta = () => undefined
  globals.useId = () => 'editar-test-id'
  globals.setPageLayout = () => undefined
  globals.useRequestURL = () => new URL('http://localhost:3000/app/entrada/teste/editar')
  globals.useSeoMeta = () => undefined
  globals.useHead = () => undefined
  globals.createError = (err: unknown) => err
  globals.clearError = (opts?: unknown) => opts
  globals.navigateTo = vi.fn()
  globals.useNuxtApp = () => ({ runWithContext: (fn: () => unknown) => fn() })
  globals.useRequestFetch = () => requestFetch
  globals.$fetch = globalFetch
  globals.useAsyncData = (_key: string, handler: () => unknown) => {
    asyncHandlers.push(handler)
    return { data: ref(null), pending: ref(false), error: ref(null), refresh: vi.fn() }
  }
  globals.useState = (_key: string, init?: () => unknown) => ({ value: init ? init() : null })
})

async function mountEditor() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/app/entrada/:id()/editar', name: 'app-entrada-id-editar', component: EditEntryPage }],
  })
  await router.push(`/app/entrada/${LOG_ID}/editar`)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp({
    render: () => h(Suspense, null, { default: () => h(EditEntryPage) }),
  })
  app.component('NuxtLink', defineComponent({ props: ['to'], setup: (_props, { slots }) => () => h('a', slots.default?.()) }))
  app.component('NuxtLayout', defineComponent({ setup: (_props, { slots }) => () => h('div', slots.default?.()) }))
  app.use(router)
  app.mount(container)
  await nextTick()
  return { app, container }
}

describe('entry editor data fetching', () => {
  it('reads the log and the work through requestFetch, so the owner session reaches SSR', async () => {
    const { app, container } = await mountEditor()

    for (const handler of asyncHandlers) {
      await Promise.resolve(handler()).catch(() => undefined)
    }

    expect(requestFetch).toHaveBeenCalledWith(`/api/logs/${LOG_ID}`, { timeout: 15_000, retry: 0 })
    expect(requestFetch).toHaveBeenCalledWith(`/api/works/${WORK_SLUG}`, { timeout: 15_000, retry: 0 })

    const globalCalls = globalFetch.mock.calls.map(([url]) => String(url))
    expect(globalCalls.filter((url) => url.startsWith('/api/logs/') || url.startsWith('/api/works/'))).toEqual([])

    app.unmount()
    container.remove()
  })
})
