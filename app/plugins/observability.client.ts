let reportedErrorsCount = 0
const MAX_CLIENT_REPORTS_PER_SESSION = 5

function reportClientError(payload: {
  message: string
  name?: string
  stack?: string
  url?: string
  requestId?: string
  component?: string
  context?: Record<string, unknown>
}): void {
  if (reportedErrorsCount >= MAX_CLIENT_REPORTS_PER_SESSION) {
    return
  }
  reportedErrorsCount++

  try {
    const body = JSON.stringify({
      message: payload.message.slice(0, 2000),
      name: payload.name?.slice(0, 100),
      stack: payload.stack?.slice(0, 8000),
      url: payload.url || (typeof window !== 'undefined' ? window.location.href : undefined),
      requestId: payload.requestId,
      component: payload.component,
      context: payload.context,
    })

    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' })
      const sent = navigator.sendBeacon('/api/observability/client-errors', blob)
      if (sent) return
    }

    fetch('/api/observability/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
    })
  } catch {
  }
}

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.config.errorHandler = (err: unknown, instance, info) => {
    const errorObj = err instanceof Error ? err : new Error(String(err))
    const internal = instance as unknown as { _?: { type?: { name?: string } } } | null | undefined
    const componentName = instance?.$options?.name || internal?._?.type?.name || 'AnonymousComponent'

    reportClientError({
      message: errorObj.message,
      name: errorObj.name,
      stack: errorObj.stack,
      component: String(componentName),
      context: { info },
    })
  }

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const errorObj = reason instanceof Error ? reason : new Error(String(reason))

    const requestId =
      (reason as { data?: { requestId?: string } })?.data?.requestId ||
      (reason as { response?: { headers?: Headers } })?.response?.headers?.get('x-request-id') ||
      undefined

    reportClientError({
      message: errorObj.message,
      name: errorObj.name,
      stack: errorObj.stack,
      requestId,
      context: { type: 'unhandledrejection' },
    })
  })

  window.addEventListener('error', (event) => {
    if (event.error) {
      reportClientError({
        message: event.error.message || event.message,
        name: event.error.name,
        stack: event.error.stack,
        context: { filename: event.filename, lineno: event.lineno, colno: event.colno },
      })
    }
  })
})
