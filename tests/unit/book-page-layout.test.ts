// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, Suspense } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import BookPage from '../../app/pages/livro/[slug].vue'
import type { WorkLogView, WorkWithDetails } from '../../shared/schemas/work'

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

async function flushAsync() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

let unmountCurrent: (() => void) | null = null

function mountPage() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/livro/:slug()', name: 'livro-slug', component: BookPage }],
  })

  const container = document.createElement('div')
  document.body.appendChild(container)

  const app = createApp({
    render: () => h(Suspense, null, { default: () => h(BookPage) }),
  })
  app.component('NuxtLink', NuxtLink)
  app.use(router)
  app.mount(container)

  unmountCurrent = () => {
    app.unmount()
    container.remove()
  }

  return container
}

function buildWork(ratings: number[]): WorkWithDetails {
  const average = ratings.length > 0
    ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
    : null
  return {
    id: '11111111-1111-1111-1111-111111111111',
    slug: 'livro-teste',
    title: 'Livro Teste',
    original_language: 'pt',
    first_published_year: 2020,
    series_name: null,
    series_number: null,
    cover_url: null,
    authors: [],
    genres: [{ id: 1, slug: 'ficcao', label_pt: 'Ficção' }],
    editions: [],
    logs: ratings.map((rating, idx): WorkLogView => ({
      id: `4444444${idx}-4444-4444-4444-444444444444`,
      rating,
      review: null,
      finished_on: '2024-01-15',
      finished_precision: 'dia',
      created_at: new Date('2024-01-15T12:00:00Z'),
      user: {
        id: `5555555${idx}-5555-5555-5555-555555555555`,
        handle: `leitor${idx}`,
        display_name: `Leitor ${idx}`,
      },
    })),
    log_count: ratings.length,
    average_rating: average,
  }
}

afterEach(() => {
  unmountCurrent?.()
  unmountCurrent = null
})

describe('BookPage rating histogram threshold', () => {
  it('hides the histogram when the book has a single rating', async () => {
    mockWorkData.value = buildWork([4])
    const container = mountPage()
    await flushAsync()

    expect(container.querySelector('.work-rating-row')).not.toBeNull()
    expect(container.querySelector('.rating-histogram')).toBeNull()
  })

  it('hides the histogram with two ratings', async () => {
    mockWorkData.value = buildWork([4, 3.5])
    const container = mountPage()
    await flushAsync()

    expect(container.querySelector('.rating-histogram')).toBeNull()
  })

  it('shows the histogram from three ratings on', async () => {
    mockWorkData.value = buildWork([4, 3.5, 5])
    const container = mountPage()
    await flushAsync()

    expect(container.querySelector('.rating-histogram')).not.toBeNull()
  })
})

describe('BookPage two-column structure', () => {
  it('keeps the header before the logs and puts the sections in the main column', async () => {
    mockWorkData.value = buildWork([4])
    const container = mountPage()
    await flushAsync()

    const card = container.querySelector('.work-card')
    expect(card).not.toBeNull()
    const children = Array.from(card?.children ?? []).map((el) => el.className)
    expect(children).toEqual(['work-header', 'work-main'])

    const main = container.querySelector('.work-main')
    expect(main?.querySelector('.logs-section')).not.toBeNull()
    expect(container.querySelector('.work-header .genre-chip')).not.toBeNull()
    expect(container.querySelector('.work-header .work-primary-action')).not.toBeNull()
  })
})

describe('BookPage loading errors', () => {
  afterEach(() => {
    mockError.value = null
    mockWorkData.value = null
  })

  it('shows the retry state, not "não encontrado", when the request fails without a 404', async () => {
    mockWorkData.value = null
    mockError.value = { message: 'fetch failed' }
    const container = mountPage()
    await flushAsync()

    expect(container.textContent).toContain('Algo deu errado. Tente de novo.')
    expect(container.textContent).toContain('Tentar de novo')
    expect(container.textContent).not.toContain('Livro não encontrado.')
  })
})
