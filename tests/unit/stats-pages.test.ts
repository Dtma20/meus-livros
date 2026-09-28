// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, type Component, defineComponent, h, nextTick, ref, Suspense } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import StatsPage from '../../app/pages/@[handle]/estatisticas.vue'
import YearStatsPage from '../../app/pages/@[handle]/ano/[ano].vue'
import ProfilePage from '../../app/pages/@[handle]/index.vue'
import type { StatsResponse } from '../../shared/schemas/stats'
import type { ProfileResponse } from '../../shared/schemas/profile'
import type { AuthSessionUser } from '../../app/middleware/auth'

const mockPageData = ref<{
  stats: StatsResponse | null
  currentUser: AuthSessionUser | null
}>({
  stats: null,
  currentUser: null,
})

const mockProfilePageData = ref<{
  profile: ProfileResponse | null
  currentUser: AuthSessionUser | null
}>({
  profile: null,
  currentUser: null,
})

const mockPending = ref(false)
const mockError = ref<unknown>(null)
const mockRefresh = vi.fn()
const showErrorCalls: unknown[] = []
let recordedSeoMeta: Record<string, unknown> = {}

vi.hoisted(() => {
  const globalScope = globalThis as unknown as Record<string, unknown>
  globalScope.defineNuxtRouteMiddleware = (fn: unknown) => fn
  globalScope.definePageMeta = () => {}
  globalScope.useId = () => 'test-id'
  globalScope.useAsyncData = (key: string) => {
    if (typeof key === 'string' && key.startsWith('profile-')) {
      return {
        data: mockProfilePageData,
        pending: mockPending,
        error: mockError,
        refresh: mockRefresh,
      }
    }
    return {
      data: mockPageData,
      pending: mockPending,
      error: mockError,
      refresh: mockRefresh,
    }
  }
  globalScope.useState = (_key: string, init?: () => unknown) => ({
    value: init ? init() : null,
  })
  globalScope.useRequestFetch = () => vi.fn()
  globalScope.useRequestURL = () => new URL('http://localhost:3000/@diogo/estatisticas')
  globalScope.useSeoMeta = (meta: Record<string, unknown>) => {
    recordedSeoMeta = meta
  }
  globalScope.useHead = () => {}
  globalScope.createError = (err: unknown) => err
  globalScope.showError = (err: unknown) => {
    showErrorCalls.push(err)
    return err
  }
  globalScope.setResponseStatus = () => {}
})

const NuxtLink = defineComponent({
  name: 'NuxtLink',
  inheritAttrs: false,
  props: {
    to: {
      type: [String, Object],
      required: true,
    },
  },
  setup(props, { slots, attrs }) {
    return () =>
      h(
        'a',
        {
          ...attrs,
          href: typeof props.to === 'string' ? props.to : JSON.stringify(props.to),
        },
        slots.default?.(),
      )
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

function mountWithRouter<T extends Component>(
  component: T,
  initialPath: string,
  routes: Array<{ path: string; name?: string; component: Component }>,
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes,
  })

  const container = document.createElement('div')
  document.body.appendChild(container)

  const app = createApp({
    render: () => h(Suspense, null, { default: () => h(component) }),
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

function createSampleStats(overrides: Partial<StatsResponse> = {}): StatsResponse {
  return {
    user: {
      handle: 'diogo',
      display_name: 'Diogo',
      ...overrides.user,
    },
    year: overrides.year ?? null,
    years: overrides.years ?? [2023, 2024],
    totals: {
      books: 12,
      pages: 3400,
      authors: 8,
      countries: 5,
      averageRating: 4.25,
      ...overrides.totals,
    },
    byYear: overrides.byYear ?? [
      { year: 2023, books: 5, pages: 1400 },
      { year: 2024, books: 7, pages: 2000 },
    ],
    genres: overrides.genres ?? [
      { label: 'Ficção', count: 6 },
      { label: 'Fantasia', count: 4 },
    ],
    authors: overrides.authors ?? [
      { label: 'Machado de Assis', slug: 'machado-de-assis', count: 3 },
      { label: 'Tolkien', slug: 'tolkien', count: 2 },
    ],
    countries: overrides.countries ?? [
      { label: 'Brasil', count: 7 },
      { label: 'Reino Unido', count: 5 },
    ],
    languages: overrides.languages ?? [
      { label: 'português', count: 8 },
      { label: 'inglês', count: 4 },
    ],
    ratings: overrides.ratings ?? [
      { rating: 5, count: 4 },
      { rating: 4, count: 5 },
      { rating: 3, count: 2 },
    ],
    formats: overrides.formats ?? [
      { format: 'fisico', count: 8 },
      { format: 'ebook', count: 3 },
      { format: 'audio', count: 1 },
    ],
    ...overrides,
  }
}

describe('ProfilePage: Ver estatísticas link', () => {
  it('renders "Ver estatísticas" link going to /@handle/estatisticas', async () => {
    mockProfilePageData.value = {
      profile: {
        user: {
          id: 'u1',
          handle: 'diogo',
          display_name: 'Diogo',
          bio: null,
          profile_visibility: 'publico',
          created_at: new Date('2024-01-01'),
        },
        logs: [],
        stats: { totalBooks: 0, uniqueAuthors: 0, uniqueCountries: 0, totalPages: 0, averagePages: 0 },
      },
      currentUser: null,
    }

    const wrapper = mountWithRouter(ProfilePage, '/@diogo', [
      { path: '/@:handle()', name: 'user-profile', component: ProfilePage },
    ])
    await wrapper.router.push('/@diogo')
    await flushAsync()

    const link = wrapper.find('a[href="/@diogo/estatisticas"]')
    expect(link).not.toBeNull()
    expect(link?.textContent?.trim()).toBe('Ver estatísticas')

    wrapper.unmount()
  })
})

describe('StatsPage (@[handle]/estatisticas.vue)', () => {
  beforeEach(() => {
    mockPending.value = false
    mockError.value = null
    showErrorCalls.length = 0
    recordedSeoMeta = {}
  })

  it('renders heading with user display_name and link back to /@handle', async () => {
    mockPageData.value = {
      stats: createSampleStats(),
      currentUser: null,
    }

    const wrapper = mountWithRouter(StatsPage, '/@diogo/estatisticas', [
      { path: '/@:handle()/estatisticas', component: StatsPage },
    ])
    await wrapper.router.push('/@diogo/estatisticas')
    await flushAsync()

    const heading = wrapper.find('h1')
    expect(heading).not.toBeNull()
    expect(heading?.textContent?.trim()).toBe('Estatísticas de Diogo')

    const backLink = wrapper.find('a.back-link')
    expect(backLink).not.toBeNull()
    expect(backLink?.getAttribute('href')).toBe('/@diogo')

    wrapper.unmount()
  })

  it('renders stat tiles with books, pages, authors, countries, and average rating', async () => {
    mockPageData.value = {
      stats: createSampleStats({
        totals: {
          books: 12,
          pages: 3400,
          authors: 8,
          countries: 5,
          averageRating: 4.3,
        },
      }),
      currentUser: null,
    }

    const wrapper = mountWithRouter(StatsPage, '/@diogo/estatisticas', [
      { path: '/@:handle()/estatisticas', component: StatsPage },
    ])
    await wrapper.router.push('/@diogo/estatisticas')
    await flushAsync()

    const text = wrapper.text()
    expect(text).toContain('12')
    expect(text).toContain('Livros')
    expect(text).toContain('3.400')
    expect(text).toContain('Páginas')
    expect(text).toContain('8')
    expect(text).toContain('Autores')
    expect(text).toContain('5')
    expect(text).toContain('Países')
    expect(text).toContain('4,3')
    expect(text).toContain('Nota média')

    wrapper.unmount()
  })

  it('renders dash (–) for average rating when null', async () => {
    mockPageData.value = {
      stats: createSampleStats({
        totals: {
          books: 1,
          pages: 100,
          authors: 1,
          countries: 1,
          averageRating: null,
        },
      }),
      currentUser: null,
    }

    const wrapper = mountWithRouter(StatsPage, '/@diogo/estatisticas', [
      { path: '/@:handle()/estatisticas', component: StatsPage },
    ])
    await wrapper.router.push('/@diogo/estatisticas')
    await flushAsync()

    expect(wrapper.text()).toContain('–')

    wrapper.unmount()
  })

  it('renders YearColumns with basePath /@handle', async () => {
    mockPageData.value = {
      stats: createSampleStats(),
      currentUser: null,
    }

    const wrapper = mountWithRouter(StatsPage, '/@diogo/estatisticas', [
      { path: '/@:handle()/estatisticas', component: StatsPage },
    ])
    await wrapper.router.push('/@diogo/estatisticas')
    await flushAsync()

    const year2023 = wrapper.find('a[href="/@diogo/ano/2023"]')
    const year2024 = wrapper.find('a[href="/@diogo/ano/2024"]')
    expect(year2023).not.toBeNull()
    expect(year2024).not.toBeNull()

    wrapper.unmount()
  })

  it('omits `to` link in authors BarList so author names are plain text, not links', async () => {
    mockPageData.value = {
      stats: createSampleStats(),
      currentUser: null,
    }

    const wrapper = mountWithRouter(StatsPage, '/@diogo/estatisticas', [
      { path: '/@:handle()/estatisticas', component: StatsPage },
    ])
    await wrapper.router.push('/@diogo/estatisticas')
    await flushAsync()

    const authorLink = wrapper.find('a[href*="/autor/"]')
    expect(authorLink).toBeNull()

    expect(wrapper.text()).toContain('Machado de Assis')
    expect(wrapper.text()).toContain('Tolkien')

    wrapper.unmount()
  })

  it('renders formats as BarList with pt-BR labels Físico, E-book, Audiolivro', async () => {
    mockPageData.value = {
      stats: createSampleStats(),
      currentUser: null,
    }

    const wrapper = mountWithRouter(StatsPage, '/@diogo/estatisticas', [
      { path: '/@:handle()/estatisticas', component: StatsPage },
    ])
    await wrapper.router.push('/@diogo/estatisticas')
    await flushAsync()

    const text = wrapper.text()
    expect(text).toContain('Físico')
    expect(text).toContain('E-book')
    expect(text).toContain('Audiolivro')

    wrapper.unmount()
  })

  it('renders empty state "Nenhuma leitura pública ainda." when totals.books is 0 for non-owner', async () => {
    mockPageData.value = {
      stats: createSampleStats({
        totals: { books: 0, pages: 0, authors: 0, countries: 0, averageRating: null },
      }),
      currentUser: { id: 'other', handle: 'amigo' },
    }

    const wrapper = mountWithRouter(StatsPage, '/@diogo/estatisticas', [
      { path: '/@:handle()/estatisticas', component: StatsPage },
    ])
    await wrapper.router.push('/@diogo/estatisticas')
    await flushAsync()

    expect(wrapper.text()).toContain('Nenhuma leitura pública ainda.')
    expect(wrapper.text()).not.toContain('Registre um livro terminado para ver suas estatísticas.')

    wrapper.unmount()
  })

  it('renders empty state with owner prompt and action to /app/novo when totals.books is 0 for owner', async () => {
    mockPageData.value = {
      stats: createSampleStats({
        totals: { books: 0, pages: 0, authors: 0, countries: 0, averageRating: null },
      }),
      currentUser: { id: 'user-diogo', handle: 'diogo' },
    }

    const wrapper = mountWithRouter(StatsPage, '/@diogo/estatisticas', [
      { path: '/@:handle()/estatisticas', component: StatsPage },
    ])
    await wrapper.router.push('/@diogo/estatisticas')
    await flushAsync()

    expect(wrapper.text()).toContain('Registre um livro terminado para ver suas estatísticas.')
    const actionLink = wrapper.find('a[href="/app/novo"]')
    expect(actionLink).not.toBeNull()

    wrapper.unmount()
  })

  it('calls showError({ statusCode: 404 }) when error has status 404', async () => {
    mockPageData.value = { stats: null, currentUser: null }
    mockError.value = { statusCode: 404 }

    const wrapper = mountWithRouter(StatsPage, '/@nao_existe/estatisticas', [
      { path: '/@:handle()/estatisticas', component: StatsPage },
    ])
    await wrapper.router.push('/@nao_existe/estatisticas')
    await flushAsync()

    expect(showErrorCalls).toContainEqual({ statusCode: 404 })

    wrapper.unmount()
  })

  it('configures useSeoMeta with formatted numbers', async () => {
    mockPageData.value = {
      stats: createSampleStats({
        totals: { books: 12, pages: 3400, authors: 8, countries: 5, averageRating: 4.2 },
      }),
      currentUser: null,
    }

    const wrapper = mountWithRouter(StatsPage, '/@diogo/estatisticas', [
      { path: '/@:handle()/estatisticas', component: StatsPage },
    ])
    await wrapper.router.push('/@diogo/estatisticas')
    await flushAsync()

    const descFn = recordedSeoMeta.description as () => string
    expect(typeof descFn).toBe('function')
    expect(descFn()).toBe('Diogo já leu 12 livros e 3.400 páginas.')

    wrapper.unmount()
  })
})

describe('YearStatsPage (@[handle]/ano/[ano].vue)', () => {
  beforeEach(() => {
    mockPending.value = false
    mockError.value = null
    showErrorCalls.length = 0
    recordedSeoMeta = {}
  })

  it('calls showError({ statusCode: 404 }) when ano is not an integer', async () => {
    mockPageData.value = { stats: null, currentUser: null }

    const wrapper = mountWithRouter(YearStatsPage, '/@diogo/ano/abc', [
      { path: '/@:handle()/ano/:ano', component: YearStatsPage },
    ])
    await wrapper.router.push('/@diogo/ano/abc')
    await flushAsync()

    expect(showErrorCalls).toContainEqual({ statusCode: 404 })

    wrapper.unmount()
  })

  it('renders heading with "<display_name> em <ano>"', async () => {
    mockPageData.value = {
      stats: createSampleStats({ year: 2024 }),
      currentUser: null,
    }

    const wrapper = mountWithRouter(YearStatsPage, '/@diogo/ano/2024', [
      { path: '/@:handle()/ano/:ano', component: YearStatsPage },
    ])
    await wrapper.router.push('/@diogo/ano/2024')
    await flushAsync()

    const heading = wrapper.find('h1')
    expect(heading?.textContent?.trim()).toBe('Diogo em 2024')

    wrapper.unmount()
  })

  it('renders year switcher with years: [2023, 2024] marking 2024 with aria-current="page"', async () => {
    mockPageData.value = {
      stats: createSampleStats({
        year: 2024,
        years: [2023, 2024],
      }),
      currentUser: null,
    }

    const wrapper = mountWithRouter(YearStatsPage, '/@diogo/ano/2024', [
      { path: '/@:handle()/ano/:ano', component: YearStatsPage },
    ])
    await wrapper.router.push('/@diogo/ano/2024')
    await flushAsync()

    const nav = wrapper.find('nav[aria-label="Outros anos"]')
    expect(nav).not.toBeNull()

    const link2023 = nav?.querySelector('a[href="/@diogo/ano/2023"]')
    const link2024 = nav?.querySelector('a[href="/@diogo/ano/2024"]')
    const linkAll = nav?.querySelector('a[href="/@diogo/estatisticas"]')

    expect(link2023).not.toBeNull()
    expect(link2024).not.toBeNull()
    expect(linkAll).not.toBeNull()
    expect(linkAll?.textContent?.trim()).toBe('Todos os anos')

    expect(link2024?.getAttribute('aria-current')).toBe('page')
    expect(link2023?.getAttribute('aria-current')).toBeNull()

    wrapper.unmount()
  })

  it('does NOT render YearColumns in year view', async () => {
    mockPageData.value = {
      stats: createSampleStats({ year: 2024 }),
      currentUser: null,
    }

    const wrapper = mountWithRouter(YearStatsPage, '/@diogo/ano/2024', [
      { path: '/@:handle()/ano/:ano', component: YearStatsPage },
    ])
    await wrapper.router.push('/@diogo/ano/2024')
    await flushAsync()

    expect(wrapper.find('.year-columns')).toBeNull()

    wrapper.unmount()
  })

  it('renders empty year state "Nenhuma leitura registrada em 2024." when books is 0', async () => {
    mockPageData.value = {
      stats: createSampleStats({
        year: 2024,
        totals: { books: 0, pages: 0, authors: 0, countries: 0, averageRating: null },
      }),
      currentUser: null,
    }

    const wrapper = mountWithRouter(YearStatsPage, '/@diogo/ano/2024', [
      { path: '/@:handle()/ano/:ano', component: YearStatsPage },
    ])
    await wrapper.router.push('/@diogo/ano/2024')
    await flushAsync()

    expect(wrapper.text()).toContain('Nenhuma leitura registrada em 2024.')

    wrapper.unmount()
  })

  it('formats OG description as "<display_name> leu <N> livros em <ano>." with singular', async () => {
    mockPageData.value = {
      stats: createSampleStats({
        year: 2025,
        totals: { books: 1, pages: 300, authors: 1, countries: 1, averageRating: 5 },
      }),
      currentUser: null,
    }

    const wrapper = mountWithRouter(YearStatsPage, '/@diogo/ano/2025', [
      { path: '/@:handle()/ano/:ano', component: YearStatsPage },
    ])
    await wrapper.router.push('/@diogo/ano/2025')
    await flushAsync()

    const descFn = recordedSeoMeta.description as () => string
    expect(typeof descFn).toBe('function')
    expect(descFn()).toBe('Diogo leu 1 livro em 2025.')

    wrapper.unmount()
  })
})
