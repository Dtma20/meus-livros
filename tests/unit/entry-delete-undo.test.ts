// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, Suspense, type App, type Ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import EntryPage from '../../app/pages/entrada/[id].vue'

vi.mock('../../app/components/book/BookCover.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../../app/components/book/StarRating.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../../app/components/log/ReviewText.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../../app/components/log/ReadingBlocksSection.vue', () => ({ default: { template: '<div />' } }))

const globals = globalThis as unknown as Record<string, unknown>
let entryData: Ref<unknown>
let entryError: Ref<unknown>
let entryPending: Ref<boolean>
let navigate: ReturnType<typeof vi.fn>
let container: HTMLElement | null = null
let app: App | null = null

function buildEntry() {
  return {
    id: 'log-1',
    user_id: 'user-1',
    user: { id: 'user-1', handle: 'diogo', display_name: 'Diogo' },
    visibility: 'publico',
    started_on: '2026-09-01',
    finished_on: null,
    finished_precision: null,
    rating: null,
    format: null,
    review: null,
    blocks: [],
    progress: { pages_read: 0, current_page: 0, total_pages: null, percentage: null, is_complete: false },
    work: { title: 'Livro teste', slug: 'livro-teste', first_published_year: 2024, authors: [], cover_url: null },
    edition: null,
  }
}

beforeEach(() => {
  entryData = ref(buildEntry())
  entryError = ref(null)
  entryPending = ref(false)
  navigate = vi.fn(() => Promise.resolve())
  globals.defineNuxtRouteMiddleware = (callback: unknown) => callback
  globals.definePageMeta = () => undefined
  globals.useId = () => 'entry-delete-id'
  globals.useRequestFetch = () => vi.fn()
  globals.useRequestURL = () => new URL('https://meus-livros.app/entrada/log-1')
  globals.useRequestEvent = () => null
  globals.useState = (key: string, init?: () => unknown) => ({ value: key === 'auth:session' ? { user: { id: 'user-1' } } : init?.() ?? null })
  globals.useNuxtApp = () => ({ runWithContext: (callback: () => unknown) => callback() })
  globals.useAsyncData = () => ({ data: entryData, pending: entryPending, error: entryError, refresh: vi.fn() })
  globals.useSeoMeta = () => undefined
  globals.useHead = () => undefined
  globals.navigateTo = navigate
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
  vi.useRealTimers()
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

function button(page: HTMLElement, label: string): HTMLButtonElement | undefined {
  return Array.from(page.querySelectorAll('button')).find(candidate => candidate.textContent?.trim() === label)
}

function pageTransition(type: 'pagehide' | 'pageshow', persisted = false): Event {
  const event = new Event(type)
  Object.defineProperty(event, 'persisted', { value: persisted })
  return event
}

async function flush(): Promise<void> {
  for (let index = 0; index < 5; index++) {
    await Promise.resolve()
    await nextTick()
  }
}

describe('entry delete undo lifecycle', () => {
  it('keeps the live region mounted while an undo is canceled', async () => {
    vi.useFakeTimers()
    const page = await mountPage()
    const status = page.querySelector('[role="status"][aria-live="polite"]')
    expect(status).not.toBeNull()

    button(page, 'Remover')?.click()
    await flush()
    expect(status?.textContent).toContain('removida em 6 segundos')
    button(page, 'Desfazer')?.click()
    await flush()

    expect(page.querySelector('[role="status"][aria-live="polite"]')).toBe(status)
    expect(status?.textContent).toBe('Remoção cancelada.')
  })

  it('does not report or navigate after a failed keepalive response on BFCache restore', async () => {
    vi.useFakeTimers()
    const page = await mountPage()
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      setTimeout(() => resolve(new Response('erro', { status: 500 })), 100)
    }))
    vi.stubGlobal('fetch', fetchMock)

    button(page, 'Remover')?.click()
    await flush()
    window.dispatchEvent(pageTransition('pagehide'))
    window.dispatchEvent(pageTransition('pageshow', true))
    await flush()

    expect(page.textContent).toContain('Removendo...')
    expect(navigate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    await flush()

    expect(page.textContent).toContain('erro')
    expect(navigate).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not send a second DELETE when unmount follows pagehide', async () => {
    const page = await mountPage()
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', fetchMock)
    button(page, 'Remover')?.click()
    await flush()
    window.dispatchEvent(pageTransition('pagehide'))
    await flush()
    app?.unmount()
    app = null

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
