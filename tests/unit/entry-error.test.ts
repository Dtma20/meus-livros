// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, Suspense, type App, type Ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import EntryPage from '../../app/pages/entrada/[id].vue'

const globals = globalThis as unknown as Record<string, unknown>
let entryData: Ref<unknown>
let entryError: Ref<unknown>
let entryPending: Ref<boolean>
let refreshEntry: ReturnType<typeof vi.fn>
let container: HTMLElement | null = null
let app: App | null = null

beforeEach(() => {
  entryData = ref(null)
  entryError = ref(null)
  entryPending = ref(false)
  refreshEntry = vi.fn()
  globals.defineNuxtRouteMiddleware = (callback: unknown) => callback
  globals.definePageMeta = () => undefined
  globals.useId = () => 'entry-error-id'
  globals.useRequestFetch = () => vi.fn()
  globals.useRequestURL = () => new URL('https://meus-livros.app/entrada/log-1')
  globals.useRequestEvent = () => null
  globals.useState = (key: string, init?: () => unknown) => ({ value: key === 'auth:session' ? { user: null } : init?.() ?? null })
  globals.useNuxtApp = () => ({ runWithContext: (callback: () => unknown) => callback() })
  globals.useAsyncData = () => ({ data: entryData, pending: entryPending, error: entryError, refresh: refreshEntry })
  globals.useSeoMeta = () => undefined
  globals.useHead = () => undefined
  globals.navigateTo = vi.fn()
  globals.$fetch = vi.fn()
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  app?.unmount()
  app = null
  container?.remove()
  container = null
  vi.unstubAllGlobals()
})

async function mountPage(): Promise<HTMLElement> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/entrada/:id', component: EntryPage }],
  })
  await router.push('/entrada/log-1')
  await router.isReady()
  app = createApp({ render: () => h(Suspense, null, { default: () => h(EntryPage) }) })
  app.component('NuxtLink', defineComponent({ props: ['to'], setup: (_props: Record<string, unknown>, { slots }) => () => h('a', slots.default?.()) }))
  app.use(router)
  app.mount(container!)
  await nextTick()
  return container!
}

describe('entry page loading errors', () => {
  it('shows the retryable error state for a server failure instead of treating it as a 404', async () => {
    entryError.value = { statusCode: 500, message: 'server failure' }
    const page = await mountPage()

    expect(page.textContent).toContain('Algo deu errado. Tente de novo.')
    expect(page.textContent).not.toContain('Entrada não encontrada')
    const retry = Array.from(page.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Tentar de novo')
    expect(retry).toBeDefined()
    retry?.click()
    expect(refreshEntry).toHaveBeenCalledTimes(1)
  })

  it('uses the not-found state for an actual 404 response', async () => {
    entryError.value = { status: 404 }
    const page = await mountPage()

    expect(page.textContent).toContain('Entrada não encontrada')
    expect(page.textContent).not.toContain('Algo deu errado')
    expect(Array.from(page.querySelectorAll('button')).some(button => button.textContent?.includes('Tentar'))).toBe(false)
  })

  it('keeps a missing payload without an HTTP 404 recoverable', async () => {
    const page = await mountPage()

    expect(page.textContent).toContain('Algo deu errado. Tente de novo.')
    expect(page.textContent).not.toContain('Entrada não encontrada')
  })
})
