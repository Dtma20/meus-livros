// @vitest-environment happy-dom
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, ref, Suspense, type Component } from 'vue'
import ShelfSection from '../../app/components/dashboard/ShelfSection.vue'
import IndexPage from '../../app/pages/index.vue'
import type {
  DashboardCompletedBook,
  DashboardInProgressBook,
  DashboardShelfBook,
  DashboardWorkView,
} from '../../shared/schemas/dashboard'
import type { FeedEntry } from '../../shared/schemas/feed'

interface HomePayload {
  authenticated: boolean
  inProgress: DashboardInProgressBook[]
  completed: DashboardCompletedBook[]
  shelf: DashboardShelfBook[]
  entries: FeedEntry[]
  hasFeedError: boolean
}

let payload: HomePayload | null = null

const globalScope = globalThis as unknown as Record<string, unknown>
globalScope.definePageMeta = () => {}
globalScope.useSeoMeta = () => {}
globalScope.useHead = () => {}
globalScope.useRequestURL = () => new URL('http://localhost:3000/')
globalScope.useRequestFetch = () => async () => null
globalScope.useNuxtApp = () => ({ runWithContext: (fn: () => unknown) => fn() })
globalScope.navigateTo = (to: string) => ({ path: to })
globalScope.useState = (_key: string, init?: () => unknown) => ({ value: init ? init() : null })
globalScope.useAsyncData = () => ({
  data: ref(payload),
  pending: ref(false),
  refresh: async () => {},
})

const NuxtLink = defineComponent({
  name: 'NuxtLink',
  props: { to: { type: String, required: true } },
  setup(props, { slots }) {
    return () => h('a', { href: props.to }, slots.default?.())
  },
})

function mount(component: Component, props: Record<string, unknown> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp({
    render: () => h(Suspense, null, { default: () => h(component, props) }),
  })
  app.component('NuxtLink', NuxtLink)
  app.mount(container)

  return {
    container,
    text: () => container.textContent?.trim() ?? '',
    find: <E extends Element = Element>(selector: string) => container.querySelector<E>(selector),
    findAll: <E extends Element = Element>(selector: string) => Array.from(container.querySelectorAll<E>(selector)),
    unmount: () => {
      app.unmount()
      container.remove()
    },
  }
}

async function flushAsync() {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

function isBefore(a: Element | null, b: Element | null): boolean {
  if (!a || !b) return false
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
}

const work: DashboardWorkView = {
  id: 'w1',
  title: 'Dom Casmurro',
  slug: 'dom-casmurro',
  first_published_year: 1899,
  cover_url: null,
  authors: [{ id: 'a1', name: 'Machado de Assis', slug: 'machado-de-assis' }],
}

const shelfBook: DashboardShelfBook = { id: 's1', work, created_at: new Date('2026-01-01T12:00:00Z') }

const inProgressBook: DashboardInProgressBook = {
  id: 'r1',
  work,
  started_on: '2026-01-01',
  updated_at: new Date('2026-01-02T12:00:00Z'),
  pages_read: 10,
  total_pages: 100,
  current_page: 10,
  percentage: 10,
}

function home(overrides: Partial<HomePayload>): HomePayload {
  return {
    authenticated: true,
    inProgress: [],
    completed: [],
    shelf: [],
    entries: [],
    hasFeedError: false,
    ...overrides,
  }
}

describe('ShelfSection.vue', () => {
  it('collapses to one row with an add link when the shelf is empty', () => {
    const wrapper = mount(ShelfSection, { books: [] })

    const row = wrapper.find('.shelf-empty-row')
    expect(row).not.toBeNull()
    expect(row?.getAttribute('aria-label')).toBe('Minha estante')
    expect(wrapper.text()).toContain('Nenhum livro esperando na estante')
    expect(wrapper.find('h2')).toBeNull()

    const links = wrapper.findAll<HTMLAnchorElement>('a')
    expect(links).toHaveLength(1)
    expect(links[0]?.getAttribute('href')).toBe('/app/novo?tab=novo')
    expect(links[0]?.textContent?.trim()).toBe('Adicionar livro')
    wrapper.unmount()
  })

  it('keeps the full section without the "+" button when there are books', () => {
    const wrapper = mount(ShelfSection, { books: [shelfBook] })

    expect(wrapper.find('.shelf-empty-row')).toBeNull()
    expect(wrapper.find('h2')?.textContent).toContain('Na estante')
    expect(wrapper.find('.section-count')?.textContent?.trim()).toBe('1')
    const plus = wrapper.findAll('a').filter((a) => a.textContent?.trim() === '+')
    expect(plus).toHaveLength(0)
    wrapper.unmount()
  })

  it('uses only type-scale font sizes', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../app/components/dashboard/ShelfSection.vue'), 'utf-8')
    expect(source).not.toMatch(/1\.05rem|11px/)
  })
})

describe('dashboard order', () => {
  it('renders empty rows after the activity feed', async () => {
    payload = home({})
    const wrapper = mount(IndexPage)
    await flushAsync()

    const feed = wrapper.find('.feed-section')
    const inProgressRow = wrapper.find('.in-progress-empty-row')
    const shelfRow = wrapper.find('.shelf-empty-row')

    expect(wrapper.find('.in-progress-section')).toBeNull()
    expect(inProgressRow?.textContent).toContain('Nada em leitura agora')
    expect(inProgressRow?.querySelector('a')?.getAttribute('href')).toBe('/app/novo')
    expect(inProgressRow?.querySelector('a')?.textContent?.trim()).toBe('Começar a ler')
    expect(isBefore(feed, inProgressRow)).toBe(true)
    expect(isBefore(inProgressRow, shelfRow)).toBe(true)
    wrapper.unmount()
  })

  it('keeps sections with items above the feed', async () => {
    payload = home({ inProgress: [inProgressBook], shelf: [shelfBook] })
    const wrapper = mount(IndexPage)
    await flushAsync()

    const inProgress = wrapper.find('.in-progress-section')
    const shelf = wrapper.find('.shelf-section')
    const feed = wrapper.find('.feed-section')

    expect(wrapper.find('.in-progress-empty-row')).toBeNull()
    expect(wrapper.find('.shelf-empty-row')).toBeNull()
    expect(isBefore(inProgress, shelf)).toBe(true)
    expect(isBefore(shelf, feed)).toBe(true)
    wrapper.unmount()
  })
})

describe('dashboard partial failure', () => {
  const originalUseAsyncData = globalScope.useAsyncData
  const originalUseState = globalScope.useState
  const originalUseRequestFetch = globalScope.useRequestFetch

  afterEach(() => {
    globalScope.useAsyncData = originalUseAsyncData
    globalScope.useState = originalUseState
    globalScope.useRequestFetch = originalUseRequestFetch
  })

  function runFetcher(failing: string) {
    globalScope.useState = (key: string, init?: () => unknown) => ({
      value: key === 'auth:session'
        ? { user: { id: 'u1', handle: 'leitor' }, fetched: true }
        : (init ? init() : null),
    })
    globalScope.useRequestFetch = () => async (url: string) => {
      if (url === failing) throw new Error('falhou')
      if (url === '/api/dashboard') return { inProgress: [inProgressBook], completed: [], shelf: [shelfBook] }
      return { entries: [] }
    }
    globalScope.useAsyncData = async (_key: string, handler: () => Promise<unknown>) => ({
      data: ref(await handler()),
      pending: ref(false),
      refresh: async () => {},
    })
  }

  it('keeps the shelves when only the feed fails and shows the error in the feed section', async () => {
    runFetcher('/api/feed/recentes')
    const wrapper = mount(IndexPage)
    await flushAsync()

    expect(wrapper.find('.in-progress-section')).not.toBeNull()
    expect(wrapper.find('.shelf-section')).not.toBeNull()
    const feed = wrapper.find('.feed-section')
    expect(feed?.textContent).toContain('Não foi possível carregar a atividade do grupo.')
    expect(feed?.textContent).not.toContain('Ninguém registrou nada ainda')
    expect(wrapper.text()).not.toContain('Não foi possível carregar suas leituras.')
    wrapper.unmount()
  })

  it('shows the page-level error when the dashboard itself fails', async () => {
    runFetcher('/api/dashboard')
    const wrapper = mount(IndexPage)
    await flushAsync()

    expect(wrapper.text()).toContain('Não foi possível carregar suas leituras.')
    expect(wrapper.find('.dashboard-content')).toBeNull()
    wrapper.unmount()
  })
})
