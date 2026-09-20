// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createApp, type Component, defineComponent, h, nextTick, ref, Suspense } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import BookPage from '../../app/pages/livro/[slug].vue'
import {
  formatCountry,
  formatLanguage,
  formatPublicationYear,
  type WorkWithDetails,
} from '../../shared/schemas/work'

const mockWorkData = ref<WorkWithDetails | null>(null)
const mockPending = ref(false)
const mockError = ref<unknown>(null)

vi.hoisted(() => {
  const globalScope = globalThis as unknown as Record<string, unknown>
  globalScope.defineNuxtRouteMiddleware = (fn: unknown) => fn
  globalScope.definePageMeta = () => {}
  globalScope.useId = () => 'test-id'
  globalScope.useAsyncData = () => ({
    data: mockWorkData,
    pending: mockPending,
    error: mockError,
  })
  globalScope.useRequestFetch = () => vi.fn()
  globalScope.useRequestURL = () => new URL('http://localhost:3000/livro/teste')
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

/** Suspense resolves the page's async setup over several microtask turns. */
async function flushAsync() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

function mount<T extends Component>(component: T, props: Record<string, unknown> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/livro/:slug()', name: 'livro-slug', component: BookPage }],
  })

  const container = document.createElement('div')
  document.body.appendChild(container)
  // The page awaits its data, which makes <script setup> async. Nuxt wraps pages
  // in Suspense; a bare createApp does not, and an async component without a
  // boundary renders nothing at all.
  const app = createApp({
    render: () => h(Suspense, null, { default: () => h(component, props) }),
  })
  app.component('NuxtLink', NuxtLink)
  app.use(router)
  app.mount(container)

  return {
    container,
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

describe('Formatters in shared/schemas/work.ts', () => {
  it('formatPublicationYear renders negative years as BC (a.C.)', () => {
    expect(formatPublicationYear(-500)).toBe('500 a.C.')
    expect(formatPublicationYear(-1)).toBe('1 a.C.')
    expect(formatPublicationYear(0)).toBe('0')
    expect(formatPublicationYear(2005)).toBe('2005')
    expect(formatPublicationYear(null)).toBeNull()
    expect(formatPublicationYear(undefined)).toBeNull()
  })

  it('formatCountry resolves ISO 3166-1 alpha-2 or preserves custom label', () => {
    expect(formatCountry('BR')).toBe('Brasil')
    expect(formatCountry('US')).toBe('Estados Unidos')
    expect(formatCountry(null, 'Roma Antiga')).toBe('Roma Antiga')
    expect(formatCountry('IT', 'Roma Antiga')).toBe('Roma Antiga')
    expect(formatCountry(null, null)).toBeNull()
    expect(formatCountry('', '')).toBeNull()
  })

  it('formatLanguage resolves ISO 639-1 code to Portuguese name', () => {
    expect(formatLanguage('en')).toBe('Inglês')
    expect(formatLanguage('pt')).toBe('Português')
    expect(formatLanguage('la')).toBe('Latim')
    expect(formatLanguage(null)).toBeNull()
    expect(formatLanguage('')).toBeNull()
  })
})

describe('BookPage component (app/pages/livro/[slug].vue)', () => {
  it('renders complete work details with negative year as 500 a.C. and visible logs', async () => {
    mockPending.value = false
    mockError.value = null
    mockWorkData.value = {
      id: '11111111-1111-1111-1111-111111111111',
      slug: 'a-arte-da-guerra',
      title: 'A Arte da Guerra',
      original_language: 'zh',
      first_published_year: -500,
      series_name: null,
      series_number: null,
      cover_url: null,
      authors: [
        {
          id: '22222222-2222-2222-2222-222222222222',
          name: 'Sun Tzu',
          slug: 'sun-tzu',
          country_code: 'CN',
          country_label: 'China',
        },
      ],
      genres: [
        { id: 2, slug: 'nao-ficcao', label_pt: 'Não Ficção' },
        { id: 16, slug: 'desenvolvimento-pessoal', label_pt: 'Desenvolvimento Pessoal' },
      ],
      editions: [
        {
          id: '33333333-3333-3333-3333-333333333333',
          isbn13: '9788538073642',
          publisher: 'Principis',
          page_count: 160,
          published_year: 2019,
          language: 'pt',
          cover_url: null,
          ol_cover_id: null,
        },
      ],
      logs: [
        {
          id: '44444444-4444-4444-4444-444444444444',
          rating: 4.5,
          review: 'Excelente clássico de estratégia.',
          finished_on: '2024-01-15',
          created_at: new Date('2024-01-15T12:00:00Z'),
          user: {
            id: '55555555-5555-5555-5555-555555555555',
            handle: 'leitor1',
            display_name: 'Leitor Um',
          },
        },
      ],
      log_count: 1,
      average_rating: 4.5,
    }

    const wrapper = mount(BookPage)
    await flushAsync()

    const text = wrapper.text()
    expect(text).toContain('A Arte da Guerra')
    expect(text).toContain('Sun Tzu')
    expect(text).toContain('China')
    expect(text).toContain('500 a.C.')
    expect(text).not.toContain('-500')
    expect(text).toContain('Não Ficção')
    expect(text).toContain('Desenvolvimento Pessoal')
    expect(text).toContain('4,5 · 1 leitura')
    expect(text).toContain('@leitor1')
    expect(text).toContain('Excelente clássico de estratégia.')

    // Link to log permalink
    const logLink = wrapper.find('a[href="/entrada/44444444-4444-4444-4444-444444444444"]')
    expect(logLink).not.toBeNull()

    // Link to reader profile
    const userLink = wrapper.find('a[href="/@leitor1"]')
    expect(userLink).not.toBeNull()

    wrapper.unmount()
  })

  it('renders empty state and no rating when nobody has logged the book', async () => {
    mockPending.value = false
    mockError.value = null
    mockWorkData.value = {
      id: '66666666-6666-6666-6666-666666666666',
      slug: 'obra-sem-leituras',
      title: 'Obra Sem Leituras',
      original_language: 'pt',
      first_published_year: 2020,
      series_name: null,
      series_number: null,
      cover_url: null,
      authors: [
        {
          id: '77777777-7777-7777-7777-777777777777',
          name: 'Autor Anônimo',
          slug: 'autor-anonimo',
          country_code: 'BR',
          country_label: null,
        },
      ],
      genres: [],
      editions: [],
      logs: [],
      log_count: 0,
      average_rating: null,
    }

    const wrapper = mount(BookPage)
    await flushAsync()

    const text = wrapper.text()
    expect(text).toContain('Obra Sem Leituras')
    expect(text).toContain('Ninguém registrou esse livro ainda.')
    // Never renders 0,0
    expect(text).not.toContain('0,0')
    expect(text).not.toContain('0.0')
    expect(wrapper.find('.work-rating-row')).toBeNull()

    wrapper.unmount()
  })

  it('renders series position as-is without numeric coercion', async () => {
    mockPending.value = false
    mockError.value = null
    mockWorkData.value = {
      id: '88888888-8888-8888-8888-888888888888',
      slug: 'pollyanna-omnibus',
      title: 'Pollyanna',
      original_language: 'en',
      first_published_year: 1913,
      series_name: 'Pollyanna',
      series_number: '1-2',
      cover_url: null,
      authors: [],
      genres: [],
      editions: [],
      logs: [],
      log_count: 0,
      average_rating: null,
    }

    const wrapper = mount(BookPage)
    await flushAsync()

    expect(wrapper.text()).toContain('Série: Pollyanna, livro 1-2')
    wrapper.unmount()
  })
})
