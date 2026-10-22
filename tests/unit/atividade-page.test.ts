// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, Suspense, type App } from 'vue'
import ActivityPage from '../../app/pages/atividade.vue'
import type { FeedEntry, FeedPageResponse } from '../../shared/schemas/feed'

const mockData = ref<FeedPageResponse | null>(null)
const mockPending = ref(false)
const mockError = ref<unknown>(null)
const mockFetch = vi.fn<(url: string, options?: unknown) => Promise<FeedPageResponse>>()

vi.hoisted(() => {
  const globalScope = globalThis as unknown as Record<string, unknown>
  globalScope.definePageMeta = () => {}
  globalScope.useSeoMeta = () => {}
  globalScope.useRequestFetch = () => vi.fn()
  globalScope.useAsyncData = () => ({
    data: mockData,
    pending: mockPending,
    error: mockError,
    refresh: vi.fn(),
  })
  globalScope.$fetch = (url: string, options?: unknown) => mockFetch(url, options)
})

// The feed list is covered by its own tests; here each item only exposes its identifiers.
vi.mock('../../app/components/feed/FeedItem.vue', async () => {
  const { defineComponent: define, h: create } = await import('vue')
  return {
    default: define({
      name: 'FeedItem',
      props: { entry: { type: Object, required: true } },
      setup(props) {
        return () =>
          create('article', {
            class: 'feed-item-stub',
            'data-id': props.entry.id,
          })
      },
    }),
  }
})

const NuxtLink = defineComponent({
  name: 'NuxtLink',
  props: { to: { type: String, required: true } },
  setup(props, { slots }) {
    return () => h('a', { href: props.to }, slots.default?.())
  },
})

const BASE_TIME = Date.parse('2026-10-01T12:00:00.000Z')

function feedEntry(id: string, overrides: Partial<FeedEntry> = {}): FeedEntry {
  return {
    id,
    kind: 'reading_log',
    log_id: id,
    block: null,
    rating: null,
    review_excerpt: null,
    started_on: '2026-09-20',
    finished_on: null,
    created_at: new Date(BASE_TIME - Number(id.replace(/\D/g, '') || 0) * 60_000).toISOString(),
    user: { handle: 'leitor', display_name: 'Leitor' },
    work: {
      id: `w-${id}`,
      title: `Livro ${id}`,
      slug: `livro-${id}`,
      first_published_year: 2020,
      cover_url: null,
      authors: [],
    },
    edition: null,
    ...overrides,
  }
}

async function flush() {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

const mounted: App[] = []

async function mountPage(data: FeedPageResponse) {
  mockData.value = data
  mockPending.value = false
  mockError.value = null

  const container = document.createElement('div')
  document.body.appendChild(container)

  const app = createApp({
    render: () => h(Suspense, null, { default: () => h(ActivityPage) }),
  })
  app.component('NuxtLink', NuxtLink)
  app.mount(container)
  mounted.push(app)
  await flush()

  return {
    container,
    readingNowHrefs: () =>
      Array.from(container.querySelectorAll<HTMLAnchorElement>('.reading-now-work')).map((a) =>
        a.getAttribute('href'),
      ),
    feedIds: () =>
      Array.from(container.querySelectorAll<HTMLElement>('.feed-item-stub')).map(
        (el) => el.dataset.id,
      ),
    button: (selector: string) => container.querySelector<HTMLButtonElement>(selector),
  }
}

describe('atividade page', () => {
  afterEach(() => {
    for (const app of mounted.splice(0)) app.unmount()
    document.body.innerHTML = ''
    mockFetch.mockReset()
    vi.restoreAllMocks()
  })

  it('links "Lendo agora" to the log when the newest event is a reading block', async () => {
    // The newest event is a block of log-1. Its own id is not a review page.
    const block = feedEntry('block-1', {
      kind: 'reading_block',
      log_id: 'log-1',
      block: {
        id: 'block-1',
        start_page: 1,
        end_page: 40,
        comment: null,
        read_at: '2026-09-30',
      },
    })
    const log = feedEntry('log-1')
    const other = feedEntry('log-2')

    const page = await mountPage({ entries: [block, log, other], nextCursor: null })

    expect(page.readingNowHrefs()).toEqual(['/entrada/log-1', '/entrada/log-2'])
  })

  it('"Carregar mais" does not append an entry already on screen', async () => {
    const a = feedEntry('a')
    const b = feedEntry('b')
    const c = feedEntry('c')
    mockFetch.mockResolvedValueOnce({ entries: [b, c], nextCursor: null })

    const page = await mountPage({ entries: [a, b], nextCursor: 'cursor-1' })
    page.button('.btn-load-more')?.click()
    await flush()

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(page.feedIds()).toEqual(['a', 'b', 'c'])
  })

  it('does not announce new activity when the top entry was deleted and only older entries arrive', async () => {
    // Shown: b (top), a, x. b is deleted on the server. The poll returns a, x and an older y.
    const minute = 60_000
    const b = feedEntry('b', { created_at: new Date(BASE_TIME).toISOString() })
    const a = feedEntry('a', { created_at: new Date(BASE_TIME - minute).toISOString() })
    const x = feedEntry('x', { created_at: new Date(BASE_TIME - 2 * minute).toISOString() })
    const y = feedEntry('y', { created_at: new Date(BASE_TIME - 3 * minute).toISOString() })
    mockFetch.mockResolvedValue({ entries: [a, x, y], nextCursor: null })

    const page = await mountPage({ entries: [b, a, x], nextCursor: null })
    window.dispatchEvent(new Event('focus'))
    await flush()

    expect(mockFetch).toHaveBeenCalled()
    expect(page.button('.new-posts-pill')).toBeNull()
    expect(page.feedIds()).toEqual(['b', 'a', 'x'])
  })

  it('announces a genuinely newer entry and loads it on click without duplicating', async () => {
    // Control for the test above: the same trigger must show the pill when a newer entry exists.
    const minute = 60_000
    const b = feedEntry('b', { created_at: new Date(BASE_TIME).toISOString() })
    const a = feedEntry('a', { created_at: new Date(BASE_TIME - minute).toISOString() })
    const n = feedEntry('n', { created_at: new Date(BASE_TIME + minute).toISOString() })
    mockFetch.mockResolvedValue({ entries: [n, b, a], nextCursor: null })

    const page = await mountPage({ entries: [b, a], nextCursor: null })
    window.dispatchEvent(new Event('focus'))
    await flush()

    const pill = page.button('.new-posts-pill')
    expect(pill).not.toBeNull()
    pill?.click()
    await flush()

    expect(page.feedIds()).toEqual(['n', 'b', 'a'])
  })
})
