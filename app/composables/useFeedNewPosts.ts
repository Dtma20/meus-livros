import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import type { FeedEntry } from '~~/shared/schemas/feed'

export interface UseFeedNewPostsOptions {
  /**
   * Returns the ID of the topmost entry currently displayed in the feed.
   */
  getTopId: () => string | undefined

  /**
   * Fetches latest feed entries from the server.
   */
  fetchLatest: () => Promise<FeedEntry[]>

  /**
   * Optional helper returning existing entry IDs to accurately detect new items
   * even if the topmost item was removed or displaced beyond the fetch window.
   */
  getExistingIds?: () => Set<string> | string[]

  /**
   * Polling interval in ms when page is visible.
   * Default: 60_000 (60s).
   */
  intervalMs?: number

  /**
   * Minimum throttle time between focus/visibility checks in ms.
   * Default: 15_000 (15s).
   */
  focusThrottleMs?: number

  /**
   * Whether polling is enabled.
   * Default: true.
   */
  enabled?: boolean | Ref<boolean> | (() => boolean)
}

export function useFeedNewPosts(options: UseFeedNewPostsOptions) {
  const {
    getTopId,
    fetchLatest,
    getExistingIds,
    intervalMs = 60_000,
    focusThrottleMs = 15_000,
    enabled = true,
  } = options

  const pendingNewEntries = ref<FeedEntry[]>([])
  const hasNewPosts = computed(() => pendingNewEntries.value.length > 0)
  const newPostsCount = computed(() => pendingNewEntries.value.length)
  const isChecking = ref(false)

  let timer: ReturnType<typeof setInterval> | null = null
  let lastCheckTime = 0

  function isEnabled(): boolean {
    if (typeof enabled === 'boolean') return enabled
    if (typeof enabled === 'function') return enabled()
    return enabled.value
  }

  async function check(): Promise<void> {
    if (typeof window === 'undefined') return
    if (!isEnabled()) return
    if (isChecking.value) return

    // Non-intrusive: only poll when document is visible
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return
    }

    isChecking.value = true
    lastCheckTime = Date.now()

    try {
      const latest = await fetchLatest()
      if (!Array.isArray(latest) || latest.length === 0) {
        return
      }

      const topId = getTopId()

      if (!topId) {
        // If feed was empty, all fetched entries are new
        pendingNewEntries.value = latest
        return
      }

      // Check if current top item is in latest entries
      const matchIndex = latest.findIndex((e) => e.id === topId)

      if (matchIndex > 0) {
        // Items before current top are new
        const fresh = latest.slice(0, matchIndex)
        pendingNewEntries.value = fresh
      } else if (matchIndex === 0) {
        // The top item hasn't changed.
        if (pendingNewEntries.value.length > 0) {
          pendingNewEntries.value = []
        }
      } else {
        // matchIndex === -1 (current top wasn't found in latest page)
        const existingRaw = getExistingIds ? getExistingIds() : [topId]
        const existingSet = existingRaw instanceof Set ? existingRaw : new Set(existingRaw)

        const fresh = latest.filter((e) => !existingSet.has(e.id))
        if (fresh.length > 0) {
          pendingNewEntries.value = fresh
        }
      }
    } catch {
      // Silently ignore background polling errors
    } finally {
      isChecking.value = false
    }
  }

  function applyNewPosts(): FeedEntry[] {
    const posts = [...pendingNewEntries.value]
    pendingNewEntries.value = []
    return posts
  }

  function dismiss(): void {
    pendingNewEntries.value = []
  }

  onMounted(() => {
    if (typeof window === 'undefined') return

    // Set up periodic interval
    timer = setInterval(() => {
      check()
    }, intervalMs)

    // Window focus listener with throttle
    const handleFocus = () => {
      if (Date.now() - lastCheckTime >= focusThrottleMs) {
        check()
      }
    }

    // Visibility change listener with throttle
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheckTime >= focusThrottleMs) {
        check()
      }
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    onBeforeUnmount(() => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    })
  })

  return {
    pendingNewEntries,
    hasNewPosts,
    newPostsCount,
    isChecking,
    check,
    applyNewPosts,
    dismiss,
  }
}
