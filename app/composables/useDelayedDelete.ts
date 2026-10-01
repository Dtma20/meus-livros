import { onBeforeUnmount, onMounted, readonly, ref, shallowRef } from 'vue'

export type DelayedDeleteReason = 'countdown' | 'replacement' | 'leave' | 'pagehide' | 'retry'

export interface DelayedDeleteContext {
  reason: DelayedDeleteReason
  keepalive: boolean
}

export type PageHideDeleteResult =
  | { success: true }
  | { success: false; error: unknown }

interface PageHideTransaction<T> {
  item: T
  restored: boolean
  abandoned: boolean
  result: PageHideDeleteResult | null
  handled: boolean
}

interface DelayedDeleteOptions<T> {
  remove: (item: T, context: DelayedDeleteContext) => Promise<unknown>
  onSuccess?: (item: T, context: DelayedDeleteContext) => void
  onFailure?: (item: T, error: unknown, context: DelayedDeleteContext) => void
  onPageHideResult?: (item: T, result: PageHideDeleteResult) => void
}

const UNDO_SECONDS = 6

export function useDelayedDelete<T>(options: DelayedDeleteOptions<T>) {
  const pendingItem = shallowRef<T | null>(null)
  const secondsRemaining = ref(0)
  const isCommitting = ref(false)
  let activeRequests = 0
  let countdownTimer: ReturnType<typeof setInterval> | null = null
  const pageHideTransactions: PageHideTransaction<T>[] = []

  function clearCountdown(): void {
    if (countdownTimer !== null) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }

  function takePending(): T | null {
    const item = pendingItem.value
    if (item === null) return null
    clearCountdown()
    pendingItem.value = null
    secondsRemaining.value = 0
    return item
  }

  function finishPageHideTransaction(transaction: PageHideTransaction<T>): void {
    if (transaction.handled || !transaction.result || (!transaction.restored && !transaction.abandoned)) return
    transaction.handled = true
    const index = pageHideTransactions.indexOf(transaction)
    if (index !== -1) pageHideTransactions.splice(index, 1)
    options.onPageHideResult?.(transaction.item, transaction.result)
  }

  async function runDelete(
    item: T,
    reason: DelayedDeleteReason,
    pageHideTransaction?: PageHideTransaction<T>,
  ): Promise<boolean> {
    const context: DelayedDeleteContext = {
      reason,
      keepalive: reason === 'pagehide',
    }
    activeRequests++
    isCommitting.value = true

    let result: PageHideDeleteResult
    try {
      await options.remove(item, context)
      result = { success: true }
    } catch (error: unknown) {
      result = { success: false, error }
    } finally {
      activeRequests--
      isCommitting.value = activeRequests > 0
    }

    if (pageHideTransaction) {
      pageHideTransaction.result = result
      finishPageHideTransaction(pageHideTransaction)
    } else if (result.success) {
      options.onSuccess?.(item, context)
    } else {
      options.onFailure?.(item, result.error, context)
    }

    return result.success
  }

  function commitPending(reason: 'countdown' | 'replacement' | 'leave' = 'countdown'): Promise<boolean> {
    const item = takePending()
    return item === null ? Promise.resolve(false) : runDelete(item, reason)
  }

  function start(item: T): void {
    if (pendingItem.value !== null) void commitPending('replacement')
    pendingItem.value = item
    secondsRemaining.value = UNDO_SECONDS
    clearCountdown()
    countdownTimer = setInterval(() => {
      if (secondsRemaining.value <= 1) {
        secondsRemaining.value = 0
        void commitPending('countdown')
      } else {
        secondsRemaining.value -= 1
      }
    }, 1000)
  }

  function cancel(): T | null {
    return takePending()
  }

  function commit(item: T, reason: 'retry' | 'replacement' = 'retry'): Promise<boolean> {
    return runDelete(item, reason)
  }

  function onPageHide(): void {
    const item = takePending()
    if (item === null) return
    const transaction: PageHideTransaction<T> = {
      item,
      restored: false,
      abandoned: false,
      result: null,
      handled: false,
    }
    pageHideTransactions.push(transaction)
    void runDelete(item, 'pagehide', transaction)
  }

  function onPageShow(event: PageTransitionEvent): void {
    if (!event.persisted) return
    const transaction = pageHideTransactions.find(candidate => !candidate.restored)
    if (!transaction) return
    transaction.restored = true
    finishPageHideTransaction(transaction)
  }

  onMounted(() => {
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('pageshow', onPageShow)
    const pending = takePending()
    if (pending !== null) void runDelete(pending, 'leave')
    for (const transaction of pageHideTransactions) {
      transaction.abandoned = true
      finishPageHideTransaction(transaction)
    }
    clearCountdown()
  })

  return {
    pendingItem: readonly(pendingItem),
    secondsRemaining: readonly(secondsRemaining),
    isCommitting: readonly(isCommitting),
    start,
    cancel,
    commitPending,
    commit,
  }
}
