import { logger } from './logger'

export interface RetryOptions {
  maxRetries?: number
  initialDelayMs?: number
  backoffFactor?: number
  maxDelayMs?: number
  jitter?: boolean
  isRetryable?: (err: unknown) => boolean
  onRetry?: (attempt: number, err: unknown, delayMs: number) => void
  operationName?: string
  module?: string
  requestId?: string
  sleepFn?: (ms: number) => Promise<void>
}

export function isTransientError(err: unknown): boolean {
  if (!err) return false

  const statusCode =
    (err as { statusCode?: number }).statusCode ??
    (err as { status?: number }).status ??
    (err as { response?: { status?: number } }).response?.status

  if (typeof statusCode === 'number') {
    if (statusCode === 408 || statusCode === 429 || statusCode >= 500) {
      return true
    }
    if (statusCode >= 400 && statusCode < 500) {
      return false
    }
  }

  const name = (err as { name?: string }).name
  if (name === 'AbortError' || name === 'TimeoutError') {
    return true
  }

  const code = (err as { code?: string }).code
  const transientSystemCodes = new Set([
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'EAI_AGAIN',
    'ENOTFOUND',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET',
  ])
  if (code && transientSystemCodes.has(code)) {
    return true
  }

  const message = (err as { message?: string }).message?.toLowerCase() || ''
  if (
    message.includes('fetch failed') ||
    message.includes('network error') ||
    message.includes('socket hang up') ||
    message.includes('timeout')
  ) {
    return true
  }

  return false
}

export function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2
  const initialDelayMs = options.initialDelayMs ?? 200
  const backoffFactor = options.backoffFactor ?? 2
  const maxDelayMs = options.maxDelayMs ?? 2000
  const useJitter = options.jitter ?? true
  const isRetryableFn = options.isRetryable ?? isTransientError
  const operationName = options.operationName ?? 'anonymous_operation'
  const module = options.module ?? 'retry'
  const sleep = options.sleepFn ?? defaultSleep

  let attempt = 0

  while (true) {
    attempt++
    try {
      return await fn(attempt)
    } catch (err: unknown) {
      const isRetryable = isRetryableFn(err)

      if (!isRetryable || attempt > maxRetries) {
        if (attempt > 1) {
          logger.error(`Todas as ${attempt} tentativas esgotadas para: ${operationName}`, {
            module,
            operation: operationName,
            requestId: options.requestId,
            attempt,
            maxAttempts: maxRetries + 1,
            error: err as Error,
          })
        }
        throw err
      }

      let delay = initialDelayMs * Math.pow(backoffFactor, attempt - 1)
      delay = Math.min(delay, maxDelayMs)

      if (useJitter) {
        const jitter = 0.75 + Math.random() * 0.5
        delay = Math.round(delay * jitter)
      }

      logger.warn(`Falha temporária em ${operationName}. Tentando novamente em ${delay}ms...`, {
        module,
        operation: operationName,
        requestId: options.requestId,
        attempt,
        maxAttempts: maxRetries + 1,
        context: { delayMs: delay },
        error: err as Error,
      })

      if (options.onRetry) {
        options.onRetry(attempt, err, delay)
      }

      await sleep(delay)
    }
  }
}
