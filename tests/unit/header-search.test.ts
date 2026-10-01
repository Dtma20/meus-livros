import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, type Component, defineComponent, h, nextTick, Suspense } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import axe from 'axe-core'

import DefaultLayout from '../../app/layouts/default.vue'
import HeaderSearch from '../../app/components/search/HeaderSearch.vue'
import SearchBox from '../../app/components/search/SearchBox.vue'

const realFetch = global.fetch

afterEach(() => {
  global.fetch = realFetch
  vi.useRealTimers()
  document.body.replaceChildren()
})

vi.hoisted(() => {
  const globalScope = globalThis as unknown as Record<string, unknown>
  globalScope.defineNuxtRouteMiddleware = (fn: unknown) => fn
  globalScope.definePageMeta = () => {}
  globalScope.useId = () => 'test-header-search-id'
  globalScope.setPageLayout = () => {}
  globalScope.useRequestURL = () => new URL('http://localhost:3000/')
  globalScope.useSeoMeta = () => {}
  globalScope.useHead = () => {}
  globalScope.useAsyncData = (_key: string, _fn: unknown) => ({
    data: { value: null },
    pending: { value: false },
    error: { value: null },
  })
  globalScope.useState = (_key: string, init?: () => unknown) => ({
    value: init ? init() : null
  })
  globalScope.navigateTo = (to: string, options?: Record<string, unknown>) => ({
    path: to,
    ...options
  })
  globalScope.clearError = (opts?: unknown) => opts
  globalScope.useNuxtApp = () => ({ runWithContext: (fn: () => unknown) => fn() })
  globalScope.useRequestFetch = () => (globalThis as unknown as Record<string, unknown>).$fetch
  globalScope.createError = (err: unknown) => err
})

const NuxtLink = defineComponent({
  name: 'NuxtLink',
  props: { to: { type: String, required: true } },
  setup(props, { slots }) {
    return () => h('a', { href: props.to }, slots.default?.())
  }
})

function createTestRouter(initialPath = '/') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>home</div>' } },
      { path: '/livro/:slug', component: { template: '<div>book</div>' } },
      { path: '/entrar', component: { template: '<div>login</div>' } },
      { path: '/entrar/ativar', component: { template: '<div>activate</div>' } },
    ]
  })
  router.push(initialPath)
  return router
}

function mount<T extends Component>(
  component: T,
  props: Record<string, unknown> = {},
  router?: Router
) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp({
    render: () => h(Suspense, null, { default: () => h(component, props) })
  })
  app.component('NuxtLink', NuxtLink)
  if (router) {
    app.use(router)
  }
  const vm = app.mount(container)

  return {
    container,
    vm,
    text: () => container.textContent?.trim() ?? '',
    find: <E extends Element = Element>(selector: string) => container.querySelector<E>(selector),
    findAll: <E extends Element = Element>(selector: string) => Array.from(container.querySelectorAll<E>(selector)),
    unmount: () => {
      app.unmount()
      container.remove()
    }
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function searchResponse(title: string): Response {
  return {
    ok: true,
    json: async () => ({
      works: [{
        id: title,
        slug: title.toLowerCase().replaceAll(' ', '-'),
        title,
        authors: [],
        first_published_year: null,
        cover_url: null,
      }],
    }),
  } as Response
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

describe('HeaderSearch and default layout', () => {
  it('renders search control on default route (/)', async () => {
    const router = createTestRouter('/')
    await router.isReady()

    const wrapper = mount(DefaultLayout, {}, router)
    await nextTick()

    const searchWrapper = wrapper.find('.header-search')
    expect(searchWrapper).not.toBeNull()

    const desktopSearchInput = wrapper.find('.header-search-desktop input[type="search"]')
    expect(desktopSearchInput).not.toBeNull()

    const searchButton = wrapper.find('button[aria-label="Buscar livros"]')
    expect(searchButton).not.toBeNull()

    wrapper.unmount()
  })

  it('hides header search on /entrar', async () => {
    const router = createTestRouter('/entrar')
    await router.isReady()

    const wrapper = mount(DefaultLayout, {}, router)
    await nextTick()

    const searchWrapper = wrapper.find('.header-search')
    expect(searchWrapper).toBeNull()

    const searchButton = wrapper.find('button[aria-label="Buscar livros"]')
    expect(searchButton).toBeNull()

    wrapper.unmount()
  })

  it('hides header search on /entrar/ativar', async () => {
    const router = createTestRouter('/entrar/ativar')
    await router.isReady()

    const wrapper = mount(DefaultLayout, {}, router)
    await nextTick()

    const searchWrapper = wrapper.find('.header-search')
    expect(searchWrapper).toBeNull()

    wrapper.unmount()
  })

  it('does not render footer in default layout', async () => {
    const router = createTestRouter('/')
    await router.isReady()

    const wrapper = mount(DefaultLayout, {}, router)
    await nextTick()

    const footer = wrapper.find('footer')
    expect(footer).toBeNull()

    wrapper.unmount()
  })

  it('opens mobile search row and focuses input when trigger is clicked', async () => {
    const router = createTestRouter('/')
    await router.isReady()

    const wrapper = mount(DefaultLayout, {}, router)
    await nextTick()

    const trigger = wrapper.find<HTMLButtonElement>('button[aria-label="Buscar livros"]')
    expect(trigger).not.toBeNull()

    expect(wrapper.find('.header-search-mobile-row')).toBeNull()

    trigger?.click()
    await nextTick()
    await nextTick()

    const mobileRow = wrapper.find('.header-search-mobile-row')
    expect(mobileRow).not.toBeNull()

    const closeBtn = wrapper.find<HTMLButtonElement>('button[aria-label="Fechar busca"]')
    expect(closeBtn).not.toBeNull()

    const mobileInput = mobileRow?.querySelector('input[type="search"]')
    expect(mobileInput).not.toBeNull()
    expect(document.activeElement).toBe(mobileInput)

    closeBtn?.click()
    await nextTick()
    await nextTick()

    expect(wrapper.find('.header-search-mobile-row')).toBeNull()
    expect(document.activeElement).toBe(trigger)

    wrapper.unmount()
  })

  it('closes mobile search row on Escape key and returns focus to trigger', async () => {
    const router = createTestRouter('/')
    await router.isReady()

    const wrapper = mount(DefaultLayout, {}, router)
    await nextTick()

    const trigger = wrapper.find<HTMLButtonElement>('button[aria-label="Buscar livros"]')
    trigger?.click()
    await nextTick()
    await nextTick()

    expect(wrapper.find('.header-search-mobile-row')).not.toBeNull()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    await nextTick()

    expect(wrapper.find('.header-search-mobile-row')).toBeNull()
    expect(document.activeElement).toBe(trigger)

    wrapper.unmount()
  })

  it('closes mobile search row when a result is selected', async () => {
    const router = createTestRouter('/')
    await router.isReady()

    const wrapper = mount(HeaderSearch, {}, router)
    await nextTick()

    const trigger = wrapper.find<HTMLButtonElement>('button[aria-label="Buscar livros"]')
    trigger?.click()
    await nextTick()
    await nextTick()

    expect(wrapper.find('.header-search-mobile-row')).not.toBeNull()

    const searchBox = wrapper.find('.header-search-mobile-row .search-box')
    expect(searchBox).not.toBeNull()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()

    expect(wrapper.find('.header-search-mobile-row')).toBeNull()

    wrapper.unmount()
  })
})

describe('SearchBox request lifecycle', () => {
  it('clears old results immediately and ignores a response after its query was replaced', async () => {
    vi.useFakeTimers()
    const originalFetch = global.fetch
    const oldRequest = deferred<Response>()
    const latestRequest = deferred<Response>()
    const fetchSpy = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(searchResponse('Resultado anterior'))
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(latestRequest.promise)
    global.fetch = fetchSpy

    const wrapper = mount(SearchBox, { navigateOnSelect: false })
    const input = wrapper.find<HTMLInputElement>('input[type="search"]')
    if (!input) throw new Error('search input not found')

    input.focus()
    input.value = 'primeira busca'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    await vi.advanceTimersByTimeAsync(250)
    await flushMicrotasks()
    expect(wrapper.text()).toContain('Resultado anterior')

    input.value = 'segunda busca'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    expect(wrapper.text()).not.toContain('Resultado anterior')
    expect(wrapper.find('.search-spinner')).not.toBeNull()

    await vi.advanceTimersByTimeAsync(250)
    const staleSignal = fetchSpy.mock.calls[1]?.[1]?.signal
    expect(staleSignal?.aborted).toBe(false)

    input.value = 'busca atual'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(staleSignal?.aborted).toBe(true)

    oldRequest.resolve(searchResponse('Resposta obsoleta'))
    await flushMicrotasks()
    expect(wrapper.text()).not.toContain('Resposta obsoleta')
    expect(wrapper.find('.search-spinner')).not.toBeNull()

    await vi.advanceTimersByTimeAsync(250)
    latestRequest.resolve(searchResponse('Resultado atual'))
    await flushMicrotasks()
    expect(wrapper.text()).toContain('Resultado atual')
    expect(wrapper.text()).not.toContain('Resposta obsoleta')
    expect(wrapper.find('.search-spinner')).toBeNull()

    wrapper.unmount()
    global.fetch = originalFetch
    vi.useRealTimers()
  })

  it('shows a recoverable error and retries the same query', async () => {
    vi.useFakeTimers()
    const originalFetch = global.fetch
    const fetchSpy = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(searchResponse('Resultado recuperado'))
    global.fetch = fetchSpy

    const wrapper = mount(SearchBox, { navigateOnSelect: false })
    const input = wrapper.find<HTMLInputElement>('input[type="search"]')
    if (!input) throw new Error('search input not found')
    input.focus()
    input.value = 'livro procurado'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    await vi.advanceTimersByTimeAsync(250)
    await flushMicrotasks()

    expect(wrapper.find('[role="alert"]')?.textContent ?? '').toContain('Não foi possível buscar livros agora.')
    expect(wrapper.find('button.search-retry')?.textContent?.trim()).toBe('Tentar novamente')

    const retry = wrapper.find<HTMLButtonElement>('button.search-retry')
    retry?.focus()
    retry?.click()
    expect(document.activeElement).toBe(input)
    await nextTick()
    await flushMicrotasks()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Resultado recuperado')
    expect(wrapper.find('[role="alert"]')).toBeNull()

    wrapper.unmount()
    global.fetch = originalFetch
    vi.useRealTimers()
  })

  it('exposes a controlled listbox only while selectable results exist', async () => {
    vi.useFakeTimers()
    const originalFetch = global.fetch
    const fetchSpy = vi.fn<typeof fetch>()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ works: [] }) } as Response)
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(searchResponse('Resultado atual'))
    global.fetch = fetchSpy

    const wrapper = mount(SearchBox, { navigateOnSelect: false })
    const input = wrapper.find<HTMLInputElement>('input[type="search"]')
    if (!input) throw new Error('search input not found')
    input.focus()

    const search = async (term: string) => {
      input.value = term
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await nextTick()
      expect(input.getAttribute('aria-expanded')).toBe('false')
      expect(input.hasAttribute('aria-controls')).toBe(false)
      await vi.advanceTimersByTimeAsync(250)
      await flushMicrotasks()
    }

    await search('nenhum livro')
    expect(wrapper.find('.search-empty')).not.toBeNull()
    expect(wrapper.find('[role="listbox"]')).toBeNull()
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(input.hasAttribute('aria-controls')).toBe(false)
    expect(wrapper.find('.search-empty button')?.closest('[role="listbox"]')).toBeNull()

    await search('falha livro')
    expect(wrapper.find('[role="alert"]')).not.toBeNull()
    expect(wrapper.find('[role="listbox"]')).toBeNull()
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(input.hasAttribute('aria-controls')).toBe(false)
    expect(wrapper.find('.search-retry')?.closest('[role="listbox"]')).toBeNull()

    await search('resultado livro')
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(input.getAttribute('aria-controls')).toBe(wrapper.find('[role="listbox"]')?.id)
    expect(wrapper.find('[role="listbox"]')).not.toBeNull()

    wrapper.unmount()
    global.fetch = originalFetch
    vi.useRealTimers()
  })

  it('has no axe violations in the search error state', async () => {
    vi.useFakeTimers()
    const originalFetch = global.fetch
    global.fetch = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'))

    const wrapper = mount(SearchBox, { navigateOnSelect: false })
    const input = wrapper.find<HTMLInputElement>('input[type="search"]')
    if (!input) throw new Error('search input not found')
    input.focus()
    input.value = 'livro erro'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    await vi.advanceTimersByTimeAsync(250)
    await flushMicrotasks()
    expect(wrapper.find('[role="alert"]')).not.toBeNull()

    vi.useRealTimers()
    const result = await axe.run(wrapper.container)
    expect(result.violations.map(violation => violation.id)).toEqual([])

    wrapper.unmount()
    global.fetch = originalFetch
  })
})
