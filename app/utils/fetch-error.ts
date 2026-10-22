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

export const TIMEOUT_MESSAGE = 'A conexão demorou demais. Verifique sua internet e tente de novo.'
