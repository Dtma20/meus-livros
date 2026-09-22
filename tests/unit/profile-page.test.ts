// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createApp, type Component, defineComponent, h, nextTick, ref, Suspense } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import ProfilePage from '../../app/pages/@[handle].vue'
import type { ProfileResponse } from '../../shared/schemas/profile'
import type { AuthSessionUser } from '../../app/middleware/auth'

const mockPageData = ref<{
  profile: ProfileResponse | null
  currentUser: AuthSessionUser | null
}>({
  profile: null,
  currentUser: null,
})
const mockPending = ref(false)
const mockError = ref<unknown>(null)

vi.hoisted(() => {
  const globalScope = globalThis as unknown as Record<string, unknown>
  globalScope.defineNuxtRouteMiddleware = (fn: unknown) => fn
  globalScope.definePageMeta = () => {}
  globalScope.useId = () => 'test-id'
  globalScope.useAsyncData = () => ({
    data: mockPageData,
    pending: mockPending,
    error: mockError,
    refresh: vi.fn(),
  })
  globalScope.useState = (_key: string, init?: () => unknown) => ({
    value: init ? init() : null,
  })
  globalScope.useRequestFetch = () => vi.fn()
  globalScope.useRequestURL = () => new URL('http://localhost:3000/@diogo')
  globalScope.useSeoMeta = () => {}
  globalScope.useHead = () => {}
  globalScope.createError = (err: unknown) => err
})

const NuxtLink = defineComponent({
  name: 'NuxtLink',
  props: { to: { type: String, required: true } },
  setup(props, { slots }) {
    return () => h('a', { href: props.to }, slots.default?.())
  },
})

const ClientOnly = defineComponent({
  name: 'ClientOnly',
  setup(_props, { slots }) {
    return () => slots.default?.()
  },
})

async function flushAsync() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

function mount<T extends Component>(component: T, props: Record<string, unknown> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/@:handle()', name: 'user-profile', component: ProfilePage }],
  })

  const container = document.createElement('div')
  document.body.appendChild(container)

  const app = createApp({
    render: () => h(Suspense, null, { default: () => h(component, props) }),
  })
  app.use(router)
  app.component('NuxtLink', NuxtLink)
  app.component('ClientOnly', ClientOnly)

  const vm = app.mount(container)

  return {
    container,
    vm,
    router,
    text: () => container.textContent?.trim() ?? '',
    find: <E extends Element = Element>(selector: string) => container.querySelector<E>(selector),
    findAll: <E extends Element = Element>(selector: string) =>
      Array.from(container.querySelectorAll<E>(selector)),
    unmount: () => {
      app.unmount()
      container.remove()
    },
  }
}

describe('ProfilePage (app/pages/@[handle].vue) — Visibility switcher and owner controls', () => {
  const sampleProfile: ProfileResponse = {
    user: {
      id: 'user-1',
      handle: 'diogo',
      display_name: 'Diogo',
      bio: 'Leitor assíduo',
      profile_visibility: 'publico',
      created_at: new Date('2024-01-01'),
    },
    stats: {
      totalBooks: 2,
      uniqueAuthors: 2,
      uniqueCountries: 2,
      totalPages: 500,
      averagePages: 250,
    },
    logs: [
      {
        id: 'log-1',
        rating: 5,
        started_on: '2024-01-01',
        finished_on: '2024-01-10',
        finished_precision: 'dia',
        format: 'fisico',
        visibility: 'publico',
        created_at: new Date('2024-01-10T12:00:00Z'),
        work: {
          id: 'work-1',
          title: 'Livro Público',
          slug: 'livro-publico',
          first_published_year: 2020,
          cover_url: null,
          authors: [{ id: 'a1', name: 'Autor 1', slug: 'autor-1', country_code: 'BR', country_label: 'Brasil' }],
          genres: [{ id: 1, slug: 'ficcao', label_pt: 'Ficção' }],
        },
        edition: {
          id: 'e1',
          isbn13: '9788598078397',
          page_count: 200,
          published_year: 2020,
          cover_url: null,
          ol_cover_id: null,
        },
      },
      {
        id: 'log-2',
        rating: 4,
        started_on: '2024-02-01',
        finished_on: '2024-02-15',
        finished_precision: 'dia',
        format: 'ebook',
        visibility: 'privado',
        created_at: new Date('2024-02-15T12:00:00Z'),
        work: {
          id: 'work-2',
          title: 'Livro Privado',
          slug: 'livro-privado',
          first_published_year: 2021,
          cover_url: null,
          authors: [{ id: 'a2', name: 'Autor 2', slug: 'autor-2', country_code: 'PT', country_label: 'Portugal' }],
          genres: [{ id: 2, slug: 'historia', label_pt: 'História' }],
        },
        edition: {
          id: 'e2',
          isbn13: null,
          page_count: 300,
          published_year: 2021,
          cover_url: null,
          ol_cover_id: null,
        },
      },
    ],
  }

  it('renders "Editar perfil" link and 3 visibility tabs when viewer is owner', async () => {
    mockPageData.value = {
      profile: sampleProfile,
      currentUser: { id: 'user-1', handle: 'diogo', email: 'diogo@test.com' },
    }

    const wrapper = mount(ProfilePage)
    await wrapper.router.push('/@diogo')
    await flushAsync()

    // 1. "Editar perfil" button
    const editBtn = wrapper.find('a.btn-edit-profile')
    expect(editBtn).not.toBeNull()
    expect(editBtn?.getAttribute('href')).toBe('/app/perfil')
    expect(editBtn?.textContent?.trim()).toBe('Editar perfil')

    // 2. Visibility tabs
    const tabs = wrapper.findAll<HTMLButtonElement>('.visibility-tab')
    expect(tabs).toHaveLength(3)

    const tabTexts = tabs.map((t) => t.textContent?.trim().replace(/\s+/g, ' '))
    expect(tabTexts).toEqual(['Todos 2', 'Públicos 1', 'Privados 1'])

    // Default active tab is 'Todos'
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true')
    expect(wrapper.findAll('.book-card-item')).toHaveLength(2)
    expect(wrapper.find('a[aria-label*="Livro Público"]')).not.toBeNull()
    expect(wrapper.find('a[aria-label*="Livro Privado"]')).not.toBeNull()
    expect(wrapper.find('.private-badge')).not.toBeNull()

    wrapper.unmount()
  })

  it('filters to public-only when clicking "Públicos" and private-only when clicking "Privados"', async () => {
    mockPageData.value = {
      profile: sampleProfile,
      currentUser: { id: 'user-1', handle: 'diogo', email: 'diogo@test.com' },
    }

    const wrapper = mount(ProfilePage)
    await wrapper.router.push('/@diogo')
    await flushAsync()

    const tabs = wrapper.findAll<HTMLButtonElement>('.visibility-tab')

    // Click 'Públicos' (index 1)
    tabs[1]?.click()
    await flushAsync()

    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true')
    expect(wrapper.findAll('.book-card-item')).toHaveLength(1)
    expect(wrapper.find('a[aria-label*="Livro Público"]')).not.toBeNull()
    expect(wrapper.find('a[aria-label*="Livro Privado"]')).toBeNull()
    expect(wrapper.find('.private-badge')).toBeNull()

    // Click 'Privados' (index 2)
    tabs[2]?.click()
    await flushAsync()

    expect(tabs[2]?.getAttribute('aria-selected')).toBe('true')
    expect(wrapper.findAll('.book-card-item')).toHaveLength(1)
    expect(wrapper.find('a[aria-label*="Livro Privado"]')).not.toBeNull()
    expect(wrapper.find('a[aria-label*="Livro Público"]')).toBeNull()
    expect(wrapper.find('.private-badge')).not.toBeNull()

    // Click back to 'Todos' (index 0)
    tabs[0]?.click()
    await flushAsync()

    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true')
    expect(wrapper.findAll('.book-card-item')).toHaveLength(2)
    expect(wrapper.find('a[aria-label*="Livro Público"]')).not.toBeNull()
    expect(wrapper.find('a[aria-label*="Livro Privado"]')).not.toBeNull()

    wrapper.unmount()
  })

  it('does not render "Editar perfil" or visibility tabs when viewer is a stranger', async () => {
    mockPageData.value = {
      profile: sampleProfile,
      currentUser: { id: 'other-user', handle: 'amigo', email: 'amigo@test.com' },
    }

    const wrapper = mount(ProfilePage)
    await wrapper.router.push('/@diogo')
    await flushAsync()

    const editBtn = wrapper.find('a.btn-edit-profile')
    expect(editBtn).toBeNull()

    const visibilityNav = wrapper.find('.visibility-nav')
    expect(visibilityNav).toBeNull()

    wrapper.unmount()
  })
})
