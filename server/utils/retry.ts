import { logger } from './logger'

export interface RetryOptions {
  /** Maximum number of retry attempts after the first failure. Default: 2 (total 3 attempts). */
  maxRetries?: number
  /** Initial delay before first retry in milliseconds. Default: 200. */
  initialDelayMs?: number
  /** Exponential backoff multiplier. Default: 2. */
  backoffFactor?: number
  /** Maximum delay cap in milliseconds. Default: 2000. */
  maxDelayMs?: number
  /** Apply random jitter to avoid thundering herd. Default: true. */
  jitter?: boolean
  /** Custom predicate to determine if an error is transient/retryable. */
  isRetryable?: (err: unknown) => boolean
  /** Callback fired before each retry sleep. */
  onRetry?: (attempt: number, err: unknown, delayMs: number) => void
  /** Name of the operation being executed, for structured logging. */
  operationName?: string
  /** Subsystem/module name for logging. Default: 'retry'. */
  module?: string
  /** Request ID to link logs to the incoming HTTP request. */
  requestId?: string
  /** Custom sleep function (useful for tests). */
  sleepFn?: (ms: number) => Promise<void>
}

/**
 * Classifies whether an error is transient (retryable) or permanent (non-retryable).
 */
export function isTransientError(err: unknown): boolean {
  if (!err) return false

  // HTTP status codes
  const statusCode =
    (err as { statusCode?: number }).statusCode ??
    (err as { status?: number }).status ??
    (err as { response?: { status?: number } }).response?.status

  if (typeof statusCode === 'number') {
    // 408 Request Timeout, 429 Too Many Requests, 500, 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout
    if (statusCode === 408 || statusCode === 429 || statusCode >= 500) {
      return true
    }
    // Permanent client errors: 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict, 422 Unprocessable
    if (statusCode >= 400 && statusCode < 500) {
      return false
    }
  }

  // Network, abort, and timeout error names
  const name = (err as { name?: string }).name
  if (name === 'AbortError' || name === 'TimeoutError') {
    return true
  }

  // System error codes (Node.js network blips)
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

  // Common error messages indicating network connection failures
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

/**
 * Executes an asynchronous operation with exponential backoff and jitter.
 * Non-transient errors (e.g. 404, 400, validation errors) are thrown immediately.
 */
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

      // Calculate exponential backoff delay
      let delay = initialDelayMs * Math.pow(backoffFactor, attempt - 1)
      delay = Math.min(delay, maxDelayMs)

      if (useJitter) {
        // Random multiplier between 0.75 and 1.25
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
