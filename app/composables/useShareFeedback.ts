import { onBeforeUnmount, ref } from 'vue'

export interface ShareRequest {
  title?: string
  text?: string
  url: string
}

function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('name' in error)) return false
  return (error as { name?: unknown }).name === 'AbortError'
}

export function useShareFeedback() {
  const copied = ref(false)
  const fallbackVisible = ref(false)
  const feedbackMessage = ref('')
  const isSharing = ref(false)
  const shareUrl = ref('')
  let feedbackTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  function clearFeedbackTimer(): void {
    if (feedbackTimer !== null) {
      clearTimeout(feedbackTimer)
      feedbackTimer = null
    }
  }

  async function share(request: ShareRequest): Promise<void> {
    if (isSharing.value) return
    clearFeedbackTimer()
    copied.value = false
    fallbackVisible.value = false
    feedbackMessage.value = ''
    shareUrl.value = request.url
    isSharing.value = true

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          await navigator.share(request)
          return
        } catch (error: unknown) {
          if (isAbortError(error)) return
        }
      }

      if (disposed) return

      try {
        const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
        if (!clipboard || typeof clipboard.writeText !== 'function') throw new Error('Clipboard unavailable')
        await clipboard.writeText(request.url)
        if (disposed) return
        copied.value = true
        feedbackMessage.value = 'Link copiado para a área de transferência.'
        feedbackTimer = setTimeout(() => {
          copied.value = false
          feedbackMessage.value = ''
          feedbackTimer = null
        }, 2500)
      } catch {
        if (disposed) return
        fallbackVisible.value = true
        feedbackMessage.value = 'Não foi possível copiar automaticamente. Selecione e copie o link abaixo.'
      }
    } finally {
      if (!disposed) isSharing.value = false
    }
  }

  onBeforeUnmount(() => {
    disposed = true
    clearFeedbackTimer()
  })

  return {
    copied,
    fallbackVisible,
    feedbackMessage,
    isSharing,
    shareUrl,
    share,
  }
}
