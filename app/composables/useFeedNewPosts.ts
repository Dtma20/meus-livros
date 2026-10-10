import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import type { FeedEntry } from '~~/shared/schemas/feed'

export interface UseFeedNewPostsOptions {
  // Newest entry on screen. Its (created_at, id) is the cursor new posts are compared against.
  getTop: () => Pick<FeedEntry, 'id' | 'created_at'> | undefined

  fetchLatest: () => Promise<FeedEntry[]>

  getExistingIds?: () => Set<string> | string[]

  intervalMs?: number

  focusThrottleMs?: number

  enabled?: boolean | Ref<boolean> | (() => boolean)
}

// Same order as the feed cursor in server/services/feed.ts: (created_at, id) descending.
// An entry is new only if it sorts above the top, so an older entry the client never saw
// (for example, one that slid into the window after the top was deleted) is not new.
function sortsAboveTop(
  entry: Pick<FeedEntry, 'id' | 'created_at'>,
  top: Pick<FeedEntry, 'id' | 'created_at'>,
): boolean {
  const entryTime = new Date(entry.created_at).getTime()
  const topTime = new Date(top.created_at).getTime()
  if (entryTime !== topTime) return entryTime > topTime
  return entry.id > top.id
}

export function useFeedNewPosts(options: UseFeedNewPostsOptions) {
  const {
    getTop,
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

      const top = getTop()

      if (!top) {
        pendingNewEntries.value = latest
        return
      }

      const known = new Set<string>(getExistingIds ? getExistingIds() : [])
      pendingNewEntries.value = latest.filter((e) => sortsAboveTop(e, top) && !known.has(e.id))
    } catch {
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

    timer = setInterval(() => {
      check()
    }, intervalMs)

    const handleFocus = () => {
      if (Date.now() - lastCheckTime >= focusThrottleMs) {
        check()
      }
    }

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
