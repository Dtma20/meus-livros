import { describe, expect, it, vi } from 'vitest'
import { isTransientError, withRetry } from '../../server/utils/retry'

describe('Retry utility (withRetry)', () => {
  describe('isTransientError classification', () => {
    it('classifies 5xx, 429, 408 as transient (retryable)', () => {
      expect(isTransientError({ statusCode: 500 })).toBe(true)
      expect(isTransientError({ statusCode: 502 })).toBe(true)
      expect(isTransientError({ statusCode: 503 })).toBe(true)
      expect(isTransientError({ statusCode: 504 })).toBe(true)
      expect(isTransientError({ statusCode: 429 })).toBe(true)
      expect(isTransientError({ statusCode: 408 })).toBe(true)
    })

    it('classifies 4xx (400, 401, 403, 404, 409, 422) as permanent (non-retryable)', () => {
      expect(isTransientError({ statusCode: 400 })).toBe(false)
      expect(isTransientError({ statusCode: 401 })).toBe(false)
      expect(isTransientError({ statusCode: 403 })).toBe(false)
      expect(isTransientError({ statusCode: 404 })).toBe(false)
      expect(isTransientError({ statusCode: 409 })).toBe(false)
      expect(isTransientError({ statusCode: 422 })).toBe(false)
    })

    it('classifies network timeouts and connection resets as transient', () => {
      const abortErr = new Error('The operation was aborted')
      abortErr.name = 'AbortError'
      expect(isTransientError(abortErr)).toBe(true)

      const timeoutErr = new Error('ETIMEDOUT error')
      ;(timeoutErr as { code?: string }).code = 'ETIMEDOUT'
      expect(isTransientError(timeoutErr)).toBe(true)

      const connReset = new Error('read ECONNRESET')
      ;(connReset as { code?: string }).code = 'ECONNRESET'
      expect(isTransientError(connReset)).toBe(true)

      const fetchFailed = new Error('TypeError: fetch failed')
      expect(isTransientError(fetchFailed)).toBe(true)
    })
  })

  describe('withRetry execution logic', () => {
    it('returns result immediately when operation succeeds on first attempt', async () => {
      const fn = vi.fn(async () => 'ok')
      const sleepFn = vi.fn(async () => {})

      const res = await withRetry(fn, { maxRetries: 2, sleepFn })

      expect(res).toBe('ok')
      expect(fn).toHaveBeenCalledTimes(1)
      expect(sleepFn).not.toHaveBeenCalled()
    })

    it('retries on transient failure and succeeds on second attempt', async () => {
      const fn = vi.fn(async (attempt) => {
        if (attempt === 1) {
          const transient = new Error('503 Service Unavailable')
          ;(transient as { statusCode?: number }).statusCode = 503
          throw transient
        }
        return 'recuperado'
      })

      const onRetry = vi.fn()
      const sleepFn = vi.fn(async () => {})

      const res = await withRetry(fn, {
        maxRetries: 2,
        initialDelayMs: 100,
        jitter: false,
        onRetry,
        sleepFn,
      })

      expect(res).toBe('recuperado')
      expect(fn).toHaveBeenCalledTimes(2)
      expect(onRetry).toHaveBeenCalledTimes(1)
      expect(onRetry).toHaveBeenCalledWith(1, expect.anything(), 100)
      expect(sleepFn).toHaveBeenCalledWith(100)
    })

    it('does not retry when encountering a permanent error (e.g. 404)', async () => {
      const notFoundErr = new Error('Not Found')
      ;(notFoundErr as { statusCode?: number }).statusCode = 404

      const fn = vi.fn(async () => {
        throw notFoundErr
      })
      const sleepFn = vi.fn(async () => {})

      await expect(
        withRetry(fn, { maxRetries: 3, sleepFn }),
      ).rejects.toThrow('Not Found')

      expect(fn).toHaveBeenCalledTimes(1)
      expect(sleepFn).not.toHaveBeenCalled()
    })

    it('throws the final error when all retry attempts are exhausted', async () => {
      const serverErr = new Error('500 Internal Error')
      ;(serverErr as { statusCode?: number }).statusCode = 500

      const fn = vi.fn(async () => {
        throw serverErr
      })
      const sleepFn = vi.fn(async () => {})

      await expect(
        withRetry(fn, {
          maxRetries: 2,
          initialDelayMs: 50,
          backoffFactor: 2,
          jitter: false,
          sleepFn,
        }),
      ).rejects.toThrow('500 Internal Error')

      // Initial attempt (1) + 2 retries (2, 3) = 3 calls
      expect(fn).toHaveBeenCalledTimes(3)
      expect(sleepFn).toHaveBeenCalledTimes(2)
      // Delay 1: 50ms, Delay 2: 100ms
      expect(sleepFn).toHaveBeenNthCalledWith(1, 50)
      expect(sleepFn).toHaveBeenNthCalledWith(2, 100)
    })
  })
})
