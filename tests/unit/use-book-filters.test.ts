import { describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, Suspense } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useBookFilters } from '../../app/composables/useBookFilters'
import ProfilePage from '../../app/pages/@[handle]/index.vue'
import type { AuthSessionUser } from '../../app/middleware/auth'
import type { ProfileLogItem, ProfileResponse } from '../../shared/schemas/profile'
import { formatCountryName } from '../../shared/schemas/profile'

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

function createSampleLog(overrides: Partial<ProfileLogItem> & {
  title?: string
  authorCountryCode?: string | null
  authorCountryLabel?: string | null
  authorName?: string
  genres?: Array<{ id: number; slug: string; label_pt: string }>
  year?: number | null
  pageCount?: number | null
}): ProfileLogItem {
  const title = overrides.title ?? 'Livro Teste'
  const authors = overrides.authorName
    ? [
        {
          id: 'author-1',
          name: overrides.authorName,
          slug: 'author-slug',
          country_code: overrides.authorCountryCode ?? null,
          country_label: overrides.authorCountryLabel ?? null,
        },
      ]
    : []

  return {
    id: overrides.id ?? `log-${Math.random().toString(36).slice(2)}`,
    rating: overrides.rating !== undefined ? overrides.rating : 4,
    started_on: overrides.started_on ?? null,
    finished_on: overrides.finished_on !== undefined ? overrides.finished_on : '2024-01-01',
    finished_precision: overrides.finished_precision ?? 'dia',
    format: overrides.format ?? 'fisico',
    visibility: overrides.visibility ?? 'publico',
    created_at: overrides.created_at ?? new Date('2024-01-01T12:00:00Z'),
    work: {
      id: `work-${Math.random().toString(36).slice(2)}`,
      title,
      slug: 'slug',
      first_published_year: overrides.year !== undefined ? overrides.year : 2020,
      cover_url: null,
      authors,
      genres: overrides.genres ?? [{ id: 1, slug: 'ficcao', label_pt: 'Ficção' }],
    },
    edition: {
      id: 'edition-1',
      isbn13: '9788598078397',
      page_count: overrides.pageCount !== undefined ? overrides.pageCount : 200,
      published_year: overrides.year !== undefined ? overrides.year : 2020,
      cover_url: null,
      ol_cover_id: null,
    },
  }
}

describe('shared/schemas/profile: formatCountryName', () => {
  it('formats ISO country code GB as "Reino Unido" in pt-BR', () => {
    expect(formatCountryName('GB', 'Reino Unido')).toBe('Reino Unido')
  })

  it('formats ISO country code US as "Estados Unidos" in pt-BR', () => {
    expect(formatCountryName('US', 'EUA')).toBe('Estados Unidos')
  })

  it('formats ISO country code BR as "Brasil" in pt-BR', () => {
    expect(formatCountryName('BR', 'Brasil')).toBe('Brasil')
  })

  it('falls back to country_label for non-ISO "Roma Antiga" where code is null', () => {
    expect(formatCountryName(null, 'Roma Antiga')).toBe('Roma Antiga')
    expect(formatCountryName('', 'Roma Antiga')).toBe('Roma Antiga')
  })

  it('returns empty string when both code and label are absent', () => {
    expect(formatCountryName(null, null)).toBe('')
    expect(formatCountryName(undefined, undefined)).toBe('')
  })
})

describe('app/composables/useBookFilters', () => {
  it('Requirement 4 bugfix: filterCountry initialises to "" (not null)', () => {
    const logs = ref<ProfileLogItem[]>([])
    const { filterCountry, filterGenre, filterDecade } = useBookFilters(logs)

    expect(filterCountry.value).toBe('')
    expect(filterGenre.value).toBe('')
    expect(filterDecade.value).toBe('')
  })

  it('Requirement 5: sorting by "read_desc" (Lidos Recentemente) with equal finished_on falls back to created_at DESC', () => {
    const logA = createSampleLog({
      id: 'log-A',
      title: 'Livro Mais Antigo no Acervo',
      finished_on: '2023-01-01',
      created_at: new Date('2023-01-01T10:00:00Z'),
    })
    const logB = createSampleLog({
      id: 'log-B',
      title: 'Livro Mais Recente no Acervo',
      finished_on: '2023-01-01',
      created_at: new Date('2023-01-01T10:05:00Z'),
    })

    const logs = ref([logA, logB])
    const { sortedBooks, sortBy } = useBookFilters(logs)
    sortBy.value = 'read_desc'

    expect(sortedBooks.value[0]?.id).toBe('log-B')
    expect(sortedBooks.value[1]?.id).toBe('log-A')
  })

  it('Requirement 5: sorting by "read_asc" (Lidos Antigamente) with equal finished_on falls back to created_at ASC', () => {
    const logA = createSampleLog({
      id: 'log-A',
      finished_on: '2023-01-01',
      created_at: new Date('2023-01-01T10:00:00Z'),
    })
    const logB = createSampleLog({
      id: 'log-B',
      finished_on: '2023-01-01',
      created_at: new Date('2023-01-01T10:05:00Z'),
    })

    const logs = ref([logB, logA])
    const { sortedBooks, sortBy } = useBookFilters(logs)
    sortBy.value = 'read_asc'

    expect(sortedBooks.value[0]?.id).toBe('log-A')
    expect(sortedBooks.value[1]?.id).toBe('log-B')
  })

  it('Requirement 5: sorting by "rating" (Melhores Notas) falls back to created_at DESC for equal ratings', () => {
    const logA = createSampleLog({
      id: 'log-A',
      rating: 5,
      created_at: new Date('2024-01-01T10:00:00Z'),
    })
    const logB = createSampleLog({
      id: 'log-B',
      rating: 5,
      created_at: new Date('2024-01-01T10:10:00Z'),
    })

    const logs = ref([logA, logB])
    const { sortedBooks, sortBy } = useBookFilters(logs)
    sortBy.value = 'rating'

    expect(sortedBooks.value[0]?.id).toBe('log-B')
    expect(sortedBooks.value[1]?.id).toBe('log-A')
  })

  it('Requirement 5: sorting by "year_desc" (Publicação Novo) falls back to created_at DESC', () => {
    const logA = createSampleLog({
      id: 'log-A',
      year: 2021,
      created_at: new Date('2024-01-01T10:00:00Z'),
    })
    const logB = createSampleLog({
      id: 'log-B',
      year: 2021,
      created_at: new Date('2024-01-01T10:10:00Z'),
    })

    const logs = ref([logA, logB])
    const { sortedBooks, sortBy } = useBookFilters(logs)
    sortBy.value = 'year_desc'

    expect(sortedBooks.value[0]?.id).toBe('log-B')
    expect(sortedBooks.value[1]?.id).toBe('log-A')
  })

  it('Requirement 5: sorting by "year_asc" (Publicação Velho) falls back to created_at ASC', () => {
    const logA = createSampleLog({
      id: 'log-A',
      year: 1984,
      created_at: new Date('2024-01-01T10:00:00Z'),
    })
    const logB = createSampleLog({
      id: 'log-B',
      year: 1984,
      created_at: new Date('2024-01-01T10:10:00Z'),
    })

    const logs = ref([logB, logA])
    const { sortedBooks, sortBy } = useBookFilters(logs)
    sortBy.value = 'year_asc'

    expect(sortedBooks.value[0]?.id).toBe('log-A')
    expect(sortedBooks.value[1]?.id).toBe('log-B')
  })

  it('Requirement 5: sorting by "alpha" (A-Z) falls back to created_at ASC for identical titles', () => {
    const logA = createSampleLog({
      id: 'log-A',
      title: 'Mesmo Título',
      created_at: new Date('2024-01-01T10:00:00Z'),
    })
    const logB = createSampleLog({
      id: 'log-B',
      title: 'Mesmo Título',
      created_at: new Date('2024-01-01T10:10:00Z'),
    })

    const logs = ref([logB, logA])
    const { sortedBooks, sortBy } = useBookFilters(logs)
    sortBy.value = 'alpha'

    expect(sortedBooks.value[0]?.id).toBe('log-A')
    expect(sortedBooks.value[1]?.id).toBe('log-B')
  })

  it('stats follow the active filters, for header and footer alike', () => {
    const log1 = createSampleLog({
      id: 'log-1',
      title: 'Livro Ficção',
      authorName: 'Autor 1',
      authorCountryCode: 'BR',
      genres: [{ id: 1, slug: 'ficcao', label_pt: 'Ficção' }],
      pageCount: 300,
    })
    const log2 = createSampleLog({
      id: 'log-2',
      title: 'Livro Filosofia',
      authorName: 'Autor 2',
      authorCountryLabel: 'Roma Antiga',
      genres: [{ id: 2, slug: 'filosofia', label_pt: 'Filosofia' }],
      pageCount: 100,
    })

    const logs = ref([log1, log2])
    const {
      filterGenre,
      sortedBooks,
      filteredStats,
      hasActiveFilters,
      resetFilters,
    } = useBookFilters(logs)

    expect(hasActiveFilters.value).toBe(false)
    expect(filteredStats.value.totalBooks).toBe(2)
    expect(filteredStats.value.uniqueAuthors).toBe(2)
    expect(filteredStats.value.uniqueCountries).toBe(2)
    expect(filteredStats.value.totalPages).toBe(400)
    expect(filteredStats.value.averagePages).toBe(200)

    filterGenre.value = 'Ficção'
    expect(hasActiveFilters.value).toBe(true)
    expect(sortedBooks.value).toHaveLength(1)
    expect(sortedBooks.value[0]?.id).toBe('log-1')

    expect(filteredStats.value.totalBooks).toBe(1)
    expect(filteredStats.value.uniqueAuthors).toBe(1)
    expect(filteredStats.value.uniqueCountries).toBe(1)
    expect(filteredStats.value.totalPages).toBe(300)
    expect(filteredStats.value.averagePages).toBe(300)

    resetFilters()
    expect(hasActiveFilters.value).toBe(false)
    expect(sortedBooks.value).toHaveLength(2)
    expect(filteredStats.value.totalBooks).toBe(2)
  })

  it('pages count only finished logs: 100 finished and 300 unfinished give totalPages 100 and averagePages 100', () => {
    const finished = createSampleLog({ id: 'finished', pageCount: 100, finished_on: '2024-03-01' })
    const reading = createSampleLog({ id: 'reading', pageCount: 300, finished_on: null })

    const logs = ref([finished, reading])
    const { filteredStats } = useBookFilters(logs)

    expect(filteredStats.value.totalBooks).toBe(2)
    expect(filteredStats.value.totalPages).toBe(100)
    expect(filteredStats.value.averagePages).toBe(100)
  })

  it('pages are zero when no log is finished', () => {
    const readingA = createSampleLog({ id: 'reading-a', pageCount: 250, finished_on: null })
    const readingB = createSampleLog({ id: 'reading-b', pageCount: 400, finished_on: null })

    const logs = ref([readingA, readingB])
    const { filteredStats } = useBookFilters(logs)

    expect(filteredStats.value.totalBooks).toBe(2)
    expect(filteredStats.value.totalPages).toBe(0)
    expect(filteredStats.value.averagePages).toBe(0)
  })

  it('pages are zero for an empty list', () => {
    const logs = ref<ProfileLogItem[]>([])
    const { filteredStats } = useBookFilters(logs)

    expect(filteredStats.value.totalPages).toBe(0)
    expect(filteredStats.value.averagePages).toBe(0)
  })

  it('Decade filtering handles standard decades and ancient / negative years', () => {
    const logModern = createSampleLog({
      id: 'modern',
      year: 2015,
    })
    const logAncient = createSampleLog({
      id: 'ancient',
      year: -49, // Math.floor(-49 / 10) * 10 = -50
    })

    const logs = ref([logModern, logAncient])
    const { availableDecades, filterDecade, sortedBooks } = useBookFilters(logs)

    expect(availableDecades.value).toContain(2010)
    expect(availableDecades.value).toContain(-50)

    filterDecade.value = -50
    expect(sortedBooks.value).toHaveLength(1)
    expect(sortedBooks.value[0]?.id).toBe('ancient')
  })
})

const NuxtLinkStub = defineComponent({
  name: 'NuxtLink',
  props: { to: { type: String, required: true } },
  setup(props, { slots }) {
    return () => h('a', { href: props.to }, slots.default?.())
  },
})

const ClientOnlyStub = defineComponent({
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

async function mountProfilePage() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/@:handle()', name: 'user-profile', component: ProfilePage }],
  })

  const container = document.createElement('div')
  document.body.appendChild(container)

  const app = createApp({
    render: () => h(Suspense, null, { default: () => h(ProfilePage) }),
  })
  app.use(router)
  app.component('NuxtLink', NuxtLinkStub)
  app.component('ClientOnly', ClientOnlyStub)
  app.mount(container)

  await router.push('/@diogo')
  await flushAsync()

  return {
    container,
    unmount: () => {
      app.unmount()
      container.remove()
    },
  }
}

function headerStat(container: HTMLElement, label: 'Livros' | 'Autores' | 'Países'): string {
  const order = { Livros: 0, Autores: 1, Países: 2 }
  const stats = Array.from(container.querySelectorAll('.profile-header .stats .stat'))
  return stats[order[label]]?.querySelector('.stat-num')?.textContent?.trim() ?? ''
}

async function chooseOption(container: HTMLElement, value: string) {
  const selects = Array.from(container.querySelectorAll<HTMLSelectElement>('select'))
  const select = selects.find((s) => Array.from(s.options).some((o) => o.value === value))
  expect(select).toBeDefined()
  if (!select) return
  select.value = value
  select.dispatchEvent(new Event('change'))
  await flushAsync()
}

describe('app/pages/@[handle]/index.vue: header and footer stats agree', () => {
  function sampleProfile(): ProfileResponse {
    return {
      user: {
        id: 'user-1',
        handle: 'diogo',
        display_name: 'Diogo',
        bio: null,
        profile_visibility: 'publico',
        created_at: new Date('2024-01-01'),
      },
      stats: { totalBooks: 3, uniqueAuthors: 3, uniqueCountries: 2, totalPages: 600, averagePages: 200 },
      logs: [
        createSampleLog({
          id: 'log-ficcao-1',
          title: 'Ficção Um',
          authorName: 'Autora Um',
          authorCountryCode: 'BR',
          genres: [{ id: 1, slug: 'ficcao', label_pt: 'Ficção' }],
          pageCount: 100,
        }),
        createSampleLog({
          id: 'log-ficcao-2',
          title: 'Ficção Dois',
          authorName: 'Autora Dois',
          authorCountryCode: 'BR',
          genres: [{ id: 1, slug: 'ficcao', label_pt: 'Ficção' }],
          pageCount: 300,
          finished_on: null,
        }),
        createSampleLog({
          id: 'log-filosofia',
          title: 'Filosofia Um',
          authorName: 'Autor Três',
          authorCountryCode: 'PT',
          genres: [{ id: 2, slug: 'filosofia', label_pt: 'Filosofia' }],
          pageCount: 200,
        }),
      ],
    }
  }

  it('with a filter active, header "Livros" equals the number of cards and shows the marker', async () => {
    mockPageData.value = { profile: sampleProfile(), currentUser: null }
    const wrapper = await mountProfilePage()

    expect(headerStat(wrapper.container, 'Livros')).toBe('3')
    expect(wrapper.container.querySelector('.profile-header')?.textContent).not.toContain('(filtros ativos)')

    await chooseOption(wrapper.container, 'Ficção')

    const cards = wrapper.container.querySelectorAll('.book-card-item')
    expect(cards).toHaveLength(2)
    expect(headerStat(wrapper.container, 'Livros')).toBe(String(cards.length))
    expect(headerStat(wrapper.container, 'Autores')).toBe('2')
    expect(headerStat(wrapper.container, 'Países')).toBe('1')
    expect(wrapper.container.querySelector('.profile-header')?.textContent).toContain('(filtros ativos)')
    expect(wrapper.container.querySelector('.paginometer strong')?.textContent?.trim()).toBe('100')

    wrapper.unmount()
  })

  it('zero results leave no "Páginas Lidas" in the DOM', async () => {
    mockPageData.value = { profile: sampleProfile(), currentUser: null }
    const wrapper = await mountProfilePage()

    expect(wrapper.container.textContent).toContain('Páginas Lidas')

    await chooseOption(wrapper.container, 'Filosofia')
    await chooseOption(wrapper.container, 'Brasil')

    expect(wrapper.container.querySelectorAll('.book-card-item')).toHaveLength(0)
    expect(wrapper.container.textContent).toContain('Nenhum livro com esses filtros.')
    expect(wrapper.container.textContent).not.toContain('Páginas Lidas')
    expect(wrapper.container.querySelector('.paginometer')).toBeNull()
    expect(headerStat(wrapper.container, 'Livros')).toBe('0')

    wrapper.unmount()
  })

  it('the not-found state links to "Ir para o início"', async () => {
    mockPageData.value = { profile: null, currentUser: null }
    mockError.value = { statusCode: 404 }
    const wrapper = await mountProfilePage()

    expect(wrapper.container.textContent).toContain('Ir para o início')
    expect(wrapper.container.textContent).not.toContain('Voltar ao início')

    mockError.value = null
    wrapper.unmount()
  })
})
