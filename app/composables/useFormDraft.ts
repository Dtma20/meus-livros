import { onBeforeUnmount } from 'vue'

export type FormDraftName = 'log' | 'add-book'
export type FormDraftMode = 'create' | 'edit'

export interface UseFormDraftOptions<T> {
  key: string | null
  snapshot: () => T
  debounceMs?: number
}

export interface UseFormDraft<T> {
  restore: (parse: (value: unknown) => T | null) => T | null
  schedule: () => void
  flush: () => void
  cancel: () => void
  clear: () => void
}

export function createFormDraftKey(
  name: FormDraftName,
  userId: string | null | undefined,
  mode: FormDraftMode,
  context: string,
): string | null {
  const normalizedUserId = userId?.trim()
  if (!normalizedUserId) return null

  return [
    'meus-livros',
    'form-draft',
    'v1',
    name,
    encodeURIComponent(normalizedUserId),
    mode,
    encodeURIComponent(context),
  ].join(':')
}

export function useFormDraft<T>(options: UseFormDraftOptions<T>): UseFormDraft<T> {
  const delay = options.debounceMs ?? 250
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingKey: string | null = null
  let hasPendingWrite = false
  let hasUnloadListener = false

  function detachUnloadListener(): void {
    if (!hasUnloadListener || typeof window === 'undefined') return
    window.removeEventListener('beforeunload', flush)
    hasUnloadListener = false
  }

  function cancelTimer(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function storage(): Storage | null {
    if (typeof window === 'undefined') return null
    try {
      return window.localStorage
    } catch {
      return null
    }
  }

  function restore(parse: (value: unknown) => T | null): T | null {
    if (!options.key) return null
    try {
      const raw = storage()?.getItem(options.key)
      if (!raw) return null
      const value: unknown = JSON.parse(raw)
      return parse(value)
    } catch {
      return null
    }
  }

  function flush(): void {
    cancelTimer()
    if (!hasPendingWrite || !pendingKey) {
      detachUnloadListener()
      return
    }

    const key = pendingKey
    hasPendingWrite = false
    pendingKey = null
    try {
      storage()?.setItem(key, JSON.stringify(options.snapshot()))
    } catch {
    } finally {
      detachUnloadListener()
    }
  }

  function schedule(): void {
    if (!options.key) return
    cancelTimer()
    pendingKey = options.key
    hasPendingWrite = true
    if (typeof window !== 'undefined' && !hasUnloadListener) {
      window.addEventListener('beforeunload', flush)
      hasUnloadListener = true
    }
    timer = setTimeout(flush, delay)
  }

  function clear(): void {
    cancelTimer()
    pendingKey = null
    hasPendingWrite = false
    detachUnloadListener()
    if (!options.key) return
    try {
      storage()?.removeItem(options.key)
    } catch {
    }
  }

  function cancel(): void {
    cancelTimer()
    pendingKey = null
    hasPendingWrite = false
    detachUnloadListener()
  }

  onBeforeUnmount(() => {
    flush()
    detachUnloadListener()
  })

  return { restore, schedule, flush, cancel, clear }
}
