// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { useFeedNewPosts } from '../../app/composables/useFeedNewPosts'
import type { FeedEntry } from '../../shared/schemas/feed'

function createMockEntry(id: string, title = 'Livro Teste'): FeedEntry {
  return {
    id,
    rating: 5,
    review_excerpt: 'Ótima leitura',
    started_on: '2026-01-01',
    finished_on: '2026-01-10',
    created_at: new Date().toISOString(),
    user: {
      handle: 'leitor',
      display_name: 'Leitor',
    },
    work: {
      id: `w-${id}`,
      title,
      slug: `livro-${id}`,
      first_published_year: 2020,
      cover_url: null,
      authors: [],
    },
    edition: null,
  }
}

describe('useFeedNewPosts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('starts with empty pending entries and hasNewPosts false', () => {
    let composable!: ReturnType<typeof useFeedNewPosts>
    const TestComponent = defineComponent({
      setup() {
        composable = useFeedNewPosts({
          getTopId: () => 'e-1',
          fetchLatest: async () => [],
        })
        return () => h('div')
      },
    })

    const mountApp = createApp(TestComponent)
    const el = document.createElement('div')
    mountApp.mount(el)

    expect(composable.hasNewPosts.value).toBe(false)
    expect(composable.newPostsCount.value).toBe(0)
    expect(composable.pendingNewEntries.value).toEqual([])

    mountApp.unmount()
  })

  it('detects new posts when newer entries exist before current topId', async () => {
    const entry1 = createMockEntry('1')
    const entry2 = createMockEntry('2')
    const entry3 = createMockEntry('3')

    let composable!: ReturnType<typeof useFeedNewPosts>
    const TestComponent = defineComponent({
      setup() {
        composable = useFeedNewPosts({
          getTopId: () => '1',
          fetchLatest: async () => [entry3, entry2, entry1],
        })
        return () => h('div')
      },
    })

    const mountApp = createApp(TestComponent)
    const el = document.createElement('div')
    mountApp.mount(el)

    await composable.check()

    expect(composable.hasNewPosts.value).toBe(true)
    expect(composable.newPostsCount.value).toBe(2)
    expect(composable.pendingNewEntries.value.map((e) => e.id)).toEqual(['3', '2'])

    const applied = composable.applyNewPosts()
    expect(applied.map((e) => e.id)).toEqual(['3', '2'])
    expect(composable.hasNewPosts.value).toBe(false)
    expect(composable.newPostsCount.value).toBe(0)
    expect(composable.pendingNewEntries.value).toEqual([])

    mountApp.unmount()
  })

  it('does not flag new posts if the top entry matches', async () => {
    const entry1 = createMockEntry('1')
    const entry0 = createMockEntry('0')

    let composable!: ReturnType<typeof useFeedNewPosts>
    const TestComponent = defineComponent({
      setup() {
        composable = useFeedNewPosts({
          getTopId: () => '1',
          fetchLatest: async () => [entry1, entry0],
        })
        return () => h('div')
      },
    })

    const mountApp = createApp(TestComponent)
    const el = document.createElement('div')
    mountApp.mount(el)

    await composable.check()

    expect(composable.hasNewPosts.value).toBe(false)
    expect(composable.newPostsCount.value).toBe(0)

    mountApp.unmount()
  })

  it('handles empty feed initially by treating all fetched entries as new', async () => {
    const entry1 = createMockEntry('1')

    let composable!: ReturnType<typeof useFeedNewPosts>
    const TestComponent = defineComponent({
      setup() {
        composable = useFeedNewPosts({
          getTopId: () => undefined,
          fetchLatest: async () => [entry1],
        })
        return () => h('div')
      },
    })

    const mountApp = createApp(TestComponent)
    const el = document.createElement('div')
    mountApp.mount(el)

    await composable.check()

    expect(composable.hasNewPosts.value).toBe(true)
    expect(composable.newPostsCount.value).toBe(1)
    expect(composable.pendingNewEntries.value[0]?.id).toBe('1')

    mountApp.unmount()
  })

  it('dismiss() clears pending posts without applying', async () => {
    const entry2 = createMockEntry('2')
    const entry1 = createMockEntry('1')

    let composable!: ReturnType<typeof useFeedNewPosts>
    const TestComponent = defineComponent({
      setup() {
        composable = useFeedNewPosts({
          getTopId: () => '1',
          fetchLatest: async () => [entry2, entry1],
        })
        return () => h('div')
      },
    })

    const mountApp = createApp(TestComponent)
    const el = document.createElement('div')
    mountApp.mount(el)

    await composable.check()
    expect(composable.hasNewPosts.value).toBe(true)

    composable.dismiss()
    expect(composable.hasNewPosts.value).toBe(false)
    expect(composable.pendingNewEntries.value).toEqual([])

    mountApp.unmount()
  })

  it('runs periodic check according to intervalMs', async () => {
    let callCount = 0

    const TestComponent = defineComponent({
      setup() {
        useFeedNewPosts({
          getTopId: () => '1',
          intervalMs: 1000,
          fetchLatest: async () => {
            callCount++
            return []
          },
        })
        return () => h('div')
      },
    })

    const mountApp = createApp(TestComponent)
    const el = document.createElement('div')
    mountApp.mount(el)

    expect(callCount).toBe(0)

    await vi.advanceTimersByTimeAsync(1000)
    expect(callCount).toBe(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(callCount).toBe(2)

    mountApp.unmount()

    await vi.advanceTimersByTimeAsync(2000)
    expect(callCount).toBe(2)
  })
})
