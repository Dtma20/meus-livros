import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import type { FeedEntry } from '~~/shared/schemas/feed'

export interface UseFeedNewPostsOptions {
  getTopId: () => string | undefined

  fetchLatest: () => Promise<FeedEntry[]>

  getExistingIds?: () => Set<string> | string[]

  intervalMs?: number

  focusThrottleMs?: number

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
        pendingNewEntries.value = latest
        return
      }

      const matchIndex = latest.findIndex((e) => e.id === topId)

      if (matchIndex > 0) {
        const fresh = latest.slice(0, matchIndex)
        pendingNewEntries.value = fresh
      } else if (matchIndex === 0) {
        if (pendingNewEntries.value.length > 0) {
          pendingNewEntries.value = []
        }
      } else {
        const existingRaw = getExistingIds ? getExistingIds() : [topId]
        const existingSet = existingRaw instanceof Set ? existingRaw : new Set(existingRaw)

        const fresh = latest.filter((e) => !existingSet.has(e.id))
        if (fresh.length > 0) {
          pendingNewEntries.value = fresh
        }
      }
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
