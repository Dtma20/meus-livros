// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createApp, type Component, defineComponent, h, nextTick, ref, Suspense } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import DiaryList from '../../app/components/profile/DiaryList.vue'
import ProfilePage from '../../app/pages/@[handle]/index.vue'
import { getDiaryDay, groupDiary } from '../../app/utils/diary'
import type { ProfileLogItem, ProfileResponse } from '../../shared/schemas/profile'
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

function createSampleLog(overrides: {
  id?: string
  workId?: string
  title?: string
  authorName?: string
  rating?: number | null
  finished_on?: string | null
  finished_precision?: 'dia' | 'mes' | 'ano'
  format?: 'fisico' | 'ebook' | 'audio' | null
  visibility?: 'publico' | 'privado'
  created_at?: string | Date
}): ProfileLogItem {
  const workId = overrides.workId ?? `work-${Math.random().toString(36).slice(2)}`
  return {
    id: overrides.id ?? `log-${Math.random().toString(36).slice(2)}`,
    rating: overrides.rating !== undefined ? overrides.rating : 4,
    started_on: null,
    finished_on: overrides.finished_on !== undefined ? overrides.finished_on : '2024-03-15',
    finished_precision: overrides.finished_precision ?? 'dia',
    format: overrides.format !== undefined ? overrides.format : 'fisico',
    visibility: overrides.visibility ?? 'publico',
    created_at: overrides.created_at ?? '2024-03-15T12:00:00Z',
    work: {
      id: workId,
      title: overrides.title ?? 'Livro de Teste',
      slug: 'livro-de-teste',
      first_published_year: 2020,
      cover_url: null,
      authors: [
        {
          id: 'author-1',
          name: overrides.authorName ?? 'Autor de Teste',
          slug: 'autor-de-teste',
          country_code: 'BR',
          country_label: 'Brasil',
        },
      ],
      genres: [{ id: 1, slug: 'ficcao', label_pt: 'Ficção' }],
    },
    edition: null,
  }
}

function mountComponent<T extends Component>(component: T, props: Record<string, unknown> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)

  const app = createApp({
    render: () => h(component, props),
  })
  app.component('NuxtLink', NuxtLink)
  app.component('ClientOnly', ClientOnly)
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

function mountPage() {
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
  app.component('NuxtLink', NuxtLink)
  app.component('ClientOnly', ClientOnly)
  app.mount(container)

  return {
    container,
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

describe('groupDiary (pure function)', () => {
  it('returns empty array when given empty list', () => {
    expect(groupDiary([])).toEqual([])
  })

  it('puts finished_on null logs in first group "Lendo agora"', () => {
    const readingNow = createSampleLog({
      id: 'reading-1',
      finished_on: null,
      created_at: '2024-04-01T10:00:00Z',
    })
    const finished = createSampleLog({
      id: 'finished-1',
      finished_on: '2024-03-20',
      created_at: '2024-03-20T10:00:00Z',
    })

    const groups = groupDiary([finished, readingNow])

    expect(groups).toHaveLength(2)
    expect(groups[0]?.title).toBe('Lendo agora')
    expect(groups[0]?.year).toBeNull()
    expect(groups[0]?.months[0]?.logs).toHaveLength(1)
    expect(groups[0]?.months[0]?.logs[0]?.id).toBe('reading-1')

    expect(groups[1]?.title).toBe('2024')
    expect(groups[1]?.year).toBe(2024)
  })

  it('two logs in March 2024 and one in January 2024 give year 2024 with March before January', () => {
    const march1 = createSampleLog({
      id: 'march-1',
      finished_on: '2024-03-10',
    })
    const march2 = createSampleLog({
      id: 'march-2',
      finished_on: '2024-03-25',
    })
    const jan1 = createSampleLog({
      id: 'jan-1',
      finished_on: '2024-01-15',
    })

    const groups = groupDiary([jan1, march1, march2])

    expect(groups).toHaveLength(1)
    const year2024 = groups[0]!
    expect(year2024.year).toBe(2024)
    expect(year2024.months).toHaveLength(2)
    expect(year2024.months[0]?.month).toBe('Março')
    expect(year2024.months[0]?.logs).toHaveLength(2)
    expect(year2024.months[1]?.month).toBe('Janeiro')
    expect(year2024.months[1]?.logs).toHaveLength(1)
  })

  it('an ano-precision 2024 log lands in "Sem mês" after the months', () => {
    const marchLog = createSampleLog({
      id: 'march-log',
      finished_on: '2024-03-01',
      finished_precision: 'mes',
    })
    const janLog = createSampleLog({
      id: 'jan-log',
      finished_on: '2024-01-10',
      finished_precision: 'dia',
    })
    const yearOnlyLog = createSampleLog({
      id: 'year-only-log',
      finished_on: '2024-01-01',
      finished_precision: 'ano',
    })

    const groups = groupDiary([yearOnlyLog, marchLog, janLog])

    expect(groups).toHaveLength(1)
    const yearGroup = groups[0]!
    expect(yearGroup.months.map((m) => m.month)).toEqual(['Março', 'Janeiro', 'Sem mês'])
    expect(yearGroup.months[2]?.logs[0]?.id).toBe('year-only-log')
  })

  it('orders ties within a bucket by created_at desc', () => {
    const logOlder = createSampleLog({
      id: 'log-older',
      finished_on: '2024-03-15',
      created_at: '2024-03-15T09:00:00Z',
    })
    const logNewer = createSampleLog({
      id: 'log-newer',
      finished_on: '2024-03-15',
      created_at: '2024-03-15T18:00:00Z',
    })

    const groups = groupDiary([logOlder, logNewer])
    const marchLogs = groups[0]!.months[0]!.logs
    expect(marchLogs[0]?.id).toBe('log-newer')
    expect(marchLogs[1]?.id).toBe('log-older')
  })

  it('orders currently reading logs by created_at desc within "Lendo agora"', () => {
    const reading1 = createSampleLog({
      id: 'reading-1',
      finished_on: null,
      created_at: '2024-04-01T10:00:00Z',
    })
    const reading2 = createSampleLog({
      id: 'reading-2',
      finished_on: null,
      created_at: '2024-04-05T10:00:00Z',
    })

    const groups = groupDiary([reading1, reading2])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.months[0]?.logs[0]?.id).toBe('reading-2')
    expect(groups[0]?.months[0]?.logs[1]?.id).toBe('reading-1')
  })

  it('orders multiple years newest first', () => {
    const log2023 = createSampleLog({
      id: 'log-2023',
      finished_on: '2023-11-20',
    })
    const log2024 = createSampleLog({
      id: 'log-2024',
      finished_on: '2024-02-10',
    })

    const groups = groupDiary([log2023, log2024])
    expect(groups.map((g) => g.year)).toEqual([2024, 2023])
  })
})

describe('getDiaryDay', () => {
  it('returns day number when precision is dia', () => {
    const log = createSampleLog({
      finished_on: '2024-03-08',
      finished_precision: 'dia',
    })
    expect(getDiaryDay(log)).toBe(8)
  })

  it('returns null when precision is mes or ano or finished_on is null', () => {
    const logMes = createSampleLog({
      finished_on: '2024-03-08',
      finished_precision: 'mes',
    })
    const logAno = createSampleLog({
      finished_on: '2024-03-08',
      finished_precision: 'ano',
    })
    const logNull = createSampleLog({
      finished_on: null,
      finished_precision: 'dia',
    })

    expect(getDiaryDay(logMes)).toBeNull()
    expect(getDiaryDay(logAno)).toBeNull()
    expect(getDiaryDay(logNull)).toBeNull()
  })
})


describe('DiaryList.vue (component unit)', () => {
  it('renders rows with day, cover, title link, author, stars, and format', () => {
    const log = createSampleLog({
      id: 'log-abc',
      title: 'Dom Casmurro',
      authorName: 'Machado de Assis',
      rating: 4.5,
      finished_on: '2024-03-15',
      finished_precision: 'dia',
      format: 'fisico',
    })

    const wrapper = mountComponent(DiaryList, { logs: [log] })

    expect(wrapper.text()).toContain('2024')
    expect(wrapper.text()).toContain('Março')
    expect(wrapper.text()).toContain('15')
    expect(wrapper.text()).toContain('Dom Casmurro')
    expect(wrapper.text()).toContain('Machado de Assis')
    expect(wrapper.text()).toContain('Livro físico')

    const titleLink = wrapper.find('a.diary-title-link')
    expect(titleLink).not.toBeNull()
    expect(titleLink?.getAttribute('href')).toBe('/entrada/log-abc')

    const stars = wrapper.find('.stars')
    expect(stars).not.toBeNull()

    wrapper.unmount()
  })

  it('renders re-reads of the same work as separate rows', () => {
    const log1 = createSampleLog({
      id: 'read-1',
      workId: 'work-dom-casmurro',
      title: 'Dom Casmurro',
      finished_on: '2024-03-15',
    })
    const log2 = createSampleLog({
      id: 'read-2',
      workId: 'work-dom-casmurro',
      title: 'Dom Casmurro',
      finished_on: '2024-01-10',
    })

    const wrapper = mountComponent(DiaryList, { logs: [log1, log2] })
    const rows = wrapper.findAll('.diary-row')
    expect(rows).toHaveLength(2)

    wrapper.unmount()
  })

  it('renders blank day column when precision is mes', () => {
    const log = createSampleLog({
      id: 'read-mes',
      title: 'Ensaio sobre a Cegueira',
      finished_on: '2024-03-01',
      finished_precision: 'mes',
    })

    const wrapper = mountComponent(DiaryList, { logs: [log] })
    const dayCell = wrapper.find('td.col-day')
    expect(dayCell?.textContent?.trim()).toBe('')

    wrapper.unmount()
  })

  it('renders "Lendo agora" section for currently reading books', () => {
    const log = createSampleLog({
      id: 'currently-reading',
      title: 'Grande Sertão: Veredas',
      finished_on: null,
    })

    const wrapper = mountComponent(DiaryList, { logs: [log] })
    expect(wrapper.text()).toContain('Lendo agora')
    expect(wrapper.text()).toContain('Grande Sertão: Veredas')

    wrapper.unmount()
  })

  it('renders no month heading when a year only has year-precision logs', () => {
    const logA = createSampleLog({
      id: 'year-only-a',
      finished_on: '2019-01-01',
      finished_precision: 'ano',
    })
    const logB = createSampleLog({
      id: 'year-only-b',
      finished_on: '2019-01-01',
      finished_precision: 'ano',
    })

    const wrapper = mountComponent(DiaryList, { logs: [logA, logB] })

    expect(wrapper.find('.diary-group-title')?.textContent?.trim()).toBe('2019')
    expect(wrapper.findAll('.diary-month-title')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('Sem mês')
    expect(wrapper.findAll('.diary-row')).toHaveLength(2)

    wrapper.unmount()
  })

  it('renders "Março" then "Sem mês" when a year mixes March and year-precision logs', () => {
    const marchLog = createSampleLog({
      id: 'march-log',
      finished_on: '2024-03-10',
      finished_precision: 'dia',
    })
    const yearOnlyLog = createSampleLog({
      id: 'year-only-log',
      finished_on: '2024-01-01',
      finished_precision: 'ano',
    })

    const wrapper = mountComponent(DiaryList, { logs: [yearOnlyLog, marchLog] })

    const monthTitles = wrapper
      .findAll('.diary-month-title')
      .map((el) => el.textContent?.trim())
    expect(monthTitles).toEqual(['Março', 'Sem mês'])

    wrapper.unmount()
  })

  it('keeps "Lendo agora" without a month heading next to a year-only year', () => {
    const readingLog = createSampleLog({
      id: 'reading-now',
      finished_on: null,
    })
    const yearOnlyLog = createSampleLog({
      id: 'year-only',
      finished_on: '2020-01-01',
      finished_precision: 'ano',
    })

    const wrapper = mountComponent(DiaryList, { logs: [yearOnlyLog, readingLog] })

    const groupTitles = wrapper
      .findAll('.diary-group-title')
      .map((el) => el.textContent?.trim())
    expect(groupTitles).toEqual(['Lendo agora', '2020'])
    expect(wrapper.findAll('.diary-month-title')).toHaveLength(0)
    expect(wrapper.findAll('.diary-row')).toHaveLength(2)

    wrapper.unmount()
  })
})

describe('ProfilePage diary integration', () => {
  const sampleProfile: ProfileResponse = {
    user: {
      id: 'user-1',
      handle: 'diogo',
      display_name: 'Diogo',
      bio: 'Leitor',
      profile_visibility: 'publico',
      created_at: '2024-01-01T00:00:00Z',
    },
    logs: [
      createSampleLog({
        id: 'log-1',
        title: 'Livro Concluído',
        visibility: 'publico',
        finished_on: '2024-03-15',
      }),
      createSampleLog({
        id: 'log-2',
        title: 'Livro Lendo Atualmente',
        visibility: 'privado',
        finished_on: null,
      }),
    ],
    stats: {
      totalBooks: 2,
      uniqueAuthors: 1,
      uniqueCountries: 1,
      totalPages: 400,
      averagePages: 200,
    },
  }

  it('shows "Lendo" badge on currently reading books in grid view without overlapping "Privado"', async () => {
    mockPageData.value = {
      profile: sampleProfile,
      currentUser: { id: 'user-1', handle: 'diogo', email: 'diogo@test.com' },
    }

    const wrapper = mountPage()
    await wrapper.router.push('/@diogo')
    await flushAsync()

    const readingBadge = wrapper.find('.reading-badge')
    expect(readingBadge).not.toBeNull()
    expect(readingBadge?.textContent?.trim()).toBe('Lendo')

    const privateBadge = wrapper.find('.private-badge')
    expect(privateBadge).not.toBeNull()
    expect(privateBadge?.textContent?.trim()).toBe('Privado')

    const badgesContainer = wrapper.find('.card-badges')
    expect(badgesContainer).not.toBeNull()
    expect(badgesContainer?.contains(readingBadge!)).toBe(true)
    expect(badgesContainer?.contains(privateBadge!)).toBe(true)

    wrapper.unmount()
  })

  it('renders diary view when ?vista=diario is present in query', async () => {
    mockPageData.value = {
      profile: sampleProfile,
      currentUser: { id: 'user-1', handle: 'diogo', email: 'diogo@test.com' },
    }

    const wrapper = mountPage()
    await wrapper.router.push('/@diogo?vista=diario')
    await flushAsync()

    const diaryList = wrapper.find('.diary-list')
    expect(diaryList).not.toBeNull()

    const tabs = wrapper.findAll<HTMLButtonElement>('.view-tab')
    expect(tabs).toHaveLength(2)
    const gradeTab = tabs.find((t) => t.textContent?.includes('Grade'))
    const diarioTab = tabs.find((t) => t.textContent?.includes('Diário'))

    expect(diarioTab?.getAttribute('aria-selected')).toBe('true')
    expect(gradeTab?.getAttribute('aria-selected')).toBe('false')

    wrapper.unmount()
  })

  it('updates copy of action-label to "Registrar leitura" in empty states', async () => {
    mockPageData.value = {
      profile: {
        ...sampleProfile,
        logs: [],
        stats: { totalBooks: 0, uniqueAuthors: 0, uniqueCountries: 0, totalPages: 0, averagePages: 0 },
      },
      currentUser: { id: 'user-1', handle: 'diogo', email: 'diogo@test.com' },
    }

    const wrapper = mountPage()
    await wrapper.router.push('/@diogo')
    await flushAsync()

    expect(wrapper.text()).toContain('Registrar leitura')
    expect(wrapper.text()).not.toContain('Registrar livro')

    wrapper.unmount()
  })
})
