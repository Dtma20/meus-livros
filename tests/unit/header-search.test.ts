import { describe, expect, it, vi } from 'vitest'
import { createApp, type Component, defineComponent, h, nextTick, Suspense } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import DefaultLayout from '../../app/layouts/default.vue'
import HeaderSearch from '../../app/components/search/HeaderSearch.vue'

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
