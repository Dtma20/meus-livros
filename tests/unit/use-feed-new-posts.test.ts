// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { useFeedNewPosts, type UseFeedNewPostsOptions } from '../../app/composables/useFeedNewPosts'
import type { FeedEntry } from '../../shared/schemas/feed'

const BASE_TIME = Date.parse('2026-10-01T12:00:00.000Z')

// Lower numbers are newer, as in the feed: entry '1' was created one minute after entry '2'.
function createMockEntry(id: string, title = 'Livro Teste'): FeedEntry {
  return {
    id,
    rating: 5,
    review_excerpt: 'Ótima leitura',
    started_on: '2026-01-01',
    finished_on: '2026-01-10',
    created_at: new Date(BASE_TIME - Number(id) * 60_000).toISOString(),
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

function mountComposable(options: UseFeedNewPostsOptions) {
  let composable!: ReturnType<typeof useFeedNewPosts>
  const TestComponent = defineComponent({
    setup() {
      composable = useFeedNewPosts(options)
      return () => h('div')
    },
  })

  const app = createApp(TestComponent)
  app.mount(document.createElement('div'))

  return {
    get composable() {
      return composable
    },
    unmount: () => app.unmount(),
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
    const mounted = mountComposable({
      getTop: () => undefined,
      fetchLatest: async () => [],
    })

    expect(mounted.composable.hasNewPosts.value).toBe(false)
    expect(mounted.composable.newPostsCount.value).toBe(0)
    expect(mounted.composable.pendingNewEntries.value).toEqual([])

    mounted.unmount()
  })

  it('detects new posts when newer entries exist before current top', async () => {
    const mounted = mountComposable({
      getTop: () => createMockEntry('3'),
      fetchLatest: async () => [createMockEntry('1'), createMockEntry('2'), createMockEntry('3')],
    })

    await mounted.composable.check()

    expect(mounted.composable.hasNewPosts.value).toBe(true)
    expect(mounted.composable.newPostsCount.value).toBe(2)
    expect(mounted.composable.pendingNewEntries.value.map((e) => e.id)).toEqual(['1', '2'])

    const applied = mounted.composable.applyNewPosts()
    expect(applied.map((e) => e.id)).toEqual(['1', '2'])
    expect(mounted.composable.hasNewPosts.value).toBe(false)
    expect(mounted.composable.newPostsCount.value).toBe(0)
    expect(mounted.composable.pendingNewEntries.value).toEqual([])

    mounted.unmount()
  })

  it('does not flag new posts if the top entry matches', async () => {
    const mounted = mountComposable({
      getTop: () => createMockEntry('1'),
      fetchLatest: async () => [createMockEntry('1'), createMockEntry('2')],
    })

    await mounted.composable.check()

    expect(mounted.composable.hasNewPosts.value).toBe(false)
    expect(mounted.composable.newPostsCount.value).toBe(0)

    mounted.unmount()
  })

  it('handles empty feed initially by treating all fetched entries as new', async () => {
    const mounted = mountComposable({
      getTop: () => undefined,
      fetchLatest: async () => [createMockEntry('1')],
    })

    await mounted.composable.check()

    expect(mounted.composable.hasNewPosts.value).toBe(true)
    expect(mounted.composable.newPostsCount.value).toBe(1)
    expect(mounted.composable.pendingNewEntries.value[0]?.id).toBe('1')

    mounted.unmount()
  })

  it('does not count an older entry as new when the top entry was deleted', async () => {
    // The client shows entries 1..20. Entry 1 is deleted on the server, so the next
    // query returns 2..21. Entry 21 is older than everything on screen: it is not new.
    const shown = Array.from({ length: 20 }, (_, i) => createMockEntry(String(i + 1)))
    const latest = Array.from({ length: 20 }, (_, i) => createMockEntry(String(i + 2)))
    const mounted = mountComposable({
      getTop: () => shown[0],
      getExistingIds: () => new Set(shown.map((e) => e.id)),
      fetchLatest: async () => latest,
    })

    await mounted.composable.check()

    expect(mounted.composable.hasNewPosts.value).toBe(false)
    expect(mounted.composable.newPostsCount.value).toBe(0)
    expect(mounted.composable.pendingNewEntries.value).toEqual([])

    const merged = [...mounted.composable.applyNewPosts(), ...shown]
    expect(new Set(merged.map((e) => e.id)).size).toBe(merged.length)

    mounted.unmount()
  })

  it('uses id as the tiebreak when created_at is equal, as the feed cursor does', async () => {
    const sameTime = new Date(BASE_TIME).toISOString()
    const top = { ...createMockEntry('1'), id: 'm', created_at: sameTime }
    const newerById = { ...createMockEntry('1'), id: 'z', created_at: sameTime }
    const olderById = { ...createMockEntry('1'), id: 'a', created_at: sameTime }

    const mounted = mountComposable({
      getTop: () => top,
      fetchLatest: async () => [newerById, top, olderById],
    })

    await mounted.composable.check()

    expect(mounted.composable.pendingNewEntries.value.map((e) => e.id)).toEqual(['z'])

    mounted.unmount()
  })

  it('orders entries created in the same millisecond by the microsecond sort_key', async () => {
    // Both entries fall in the same millisecond. The newer one (.123900Z) has the smaller id, so
    // only sort_key can tell that it is newer; a millisecond comparison followed by id would not.
    const sameMillisecond = '2026-10-01T12:00:00.123Z'
    const top = {
      ...createMockEntry('1'),
      id: 'ffffffff-0000-4000-8000-000000000002',
      created_at: sameMillisecond,
      sort_key: '2026-10-01T12:00:00.123100Z',
    }
    const newer = {
      ...createMockEntry('1'),
      id: '00000000-0000-4000-8000-000000000001',
      created_at: sameMillisecond,
      sort_key: '2026-10-01T12:00:00.123900Z',
    }

    const mounted = mountComposable({
      getTop: () => top,
      fetchLatest: async () => [newer, top],
    })

    await mounted.composable.check()

    expect(mounted.composable.pendingNewEntries.value.map((e) => e.id)).toEqual([newer.id])

    mounted.unmount()
  })

  it('dismiss() clears pending posts without applying', async () => {
    const mounted = mountComposable({
      getTop: () => createMockEntry('3'),
      fetchLatest: async () => [createMockEntry('1'), createMockEntry('2'), createMockEntry('3')],
    })

    await mounted.composable.check()
    expect(mounted.composable.hasNewPosts.value).toBe(true)

    mounted.composable.dismiss()
    expect(mounted.composable.hasNewPosts.value).toBe(false)
    expect(mounted.composable.pendingNewEntries.value).toEqual([])

    mounted.unmount()
  })

  it('runs periodic check according to intervalMs', async () => {
    let callCount = 0

    const mounted = mountComposable({
      getTop: () => createMockEntry('1'),
      intervalMs: 1000,
      fetchLatest: async () => {
        callCount++
        return []
      },
    })

    expect(callCount).toBe(0)

    await vi.advanceTimersByTimeAsync(1000)
    expect(callCount).toBe(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(callCount).toBe(2)

    mounted.unmount()

    await vi.advanceTimersByTimeAsync(2000)
    expect(callCount).toBe(2)
  })
})
