/**
 * Was this `$fetch` rejection a timeout or an abort?
 *
 * Not `err.name === 'TimeoutError'`, which is the shape of the error ofetch
 * builds *internally* and never the shape it throws. On a timeout ofetch aborts
 * with `error.name = 'TimeoutError'`, then wraps it:
 *
 *   class FetchError extends Error { … this.name = 'FetchError' }
 *   createFetchError(ctx) -> new FetchError(message, ctx.error ? { cause: ctx.error } : undefined)
 *
 * So the caller receives `name === 'FetchError'` with the real reason one level
 * down in `cause`. Checking only `name` never matches, every timeout falls
 * through to the generic `data?.message ?? '…'` branch, and since a timed-out
 * request has no response body at all, `data` is undefined and the user gets
 * the fallback copy for what is really a connection problem. That shipped, and
 * it is what "Não foi possível salvar o registro de leitura." was hiding.
 *
 * The cause chain is walked rather than read one deep: ofetch's retry path can
 * wrap an already-wrapped error, and the depth is not something to depend on.
 */
export function isTimeoutOrAbort(err: unknown): boolean {
  let current: unknown = err
  for (let depth = 0; current && depth < 5; depth++) {
    const name = (current as { name?: unknown }).name
    if (name === 'TimeoutError' || name === 'AbortError') {
      return true
    }
    current = (current as { cause?: unknown }).cause
  }
  return false
}

/** The one pt-BR message for a request that never came back. */
export const TIMEOUT_MESSAGE = 'A conexão demorou demais. Verifique sua internet e tente de novo.'
