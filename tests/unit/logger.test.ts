import { describe, expect, it } from 'vitest'
import type { LogEntry } from '../../shared/types/logger'
import { Logger, sanitizeLogData } from '../../server/utils/logger'

describe('Logger unit tests', () => {
  describe('Sanitization of sensitive data', () => {
    it('redacts sensitive keys: password, token, secret, otp, cookie, auth', () => {
      const sensitiveData = {
        username: 'leitor123',
        password: 'super_secret_password',
        token: 'session_token_xyz',
        authSecret: 'better_auth_secret_123',
        nested: {
          otpCode: '123456',
          userCookie: 'sid=abc',
          apiKey: 'key_live_999',
          normalField: 'ok',
        },
      }

      const sanitized = sanitizeLogData(sensitiveData) as Record<string, unknown>

      expect(sanitized.username).toBe('leitor123')
      expect(sanitized.password).toBe('[REDACTED]')
      expect(sanitized.token).toBe('[REDACTED]')
      expect(sanitized.authSecret).toBe('[REDACTED]')

      const nested = sanitized.nested as Record<string, unknown>
      expect(nested.otpCode).toBe('[REDACTED]')
      expect(nested.userCookie).toBe('[REDACTED]')
      expect(nested.apiKey).toBe('[REDACTED]')
      expect(nested.normalField).toBe('ok')
    })

    it('masks email addresses according to security.md spec (d***@***)', () => {
      const dataWithEmails = {
        email: 'diogo@example.com',
        userBio: 'Contato em maria.silva@meuslivros.app para sugestões',
      }

      const sanitized = sanitizeLogData(dataWithEmails) as Record<string, unknown>

      expect(sanitized.email).toBe('d***@***')
      expect(sanitized.userBio).toContain('m***@***')
      expect(sanitized.userBio).not.toContain('maria.silva@meuslivros.app')
    })

    it('safely handles circular references without infinite recursion', () => {
      const circular: Record<string, unknown> = { name: 'cyclic' }
      circular.self = circular

      const sanitized = sanitizeLogData(circular) as Record<string, unknown>
      expect(sanitized.name).toBe('cyclic')
      expect(sanitized.self).toBe('[CIRCULAR]')
    })

    it('truncates oversized strings to prevent log flooding', () => {
      const hugeString = 'a'.repeat(5000)
      const sanitized = sanitizeLogData(hugeString) as string

      expect(sanitized.length).toBeLessThan(4200)
      expect(sanitized).toContain('[TRUNCATED')
    })
  })

  describe('Log levels and filtering', () => {
    it('filters out messages below the configured minLevel', () => {
      const entries: LogEntry[] = []
      const customLogger = new Logger({
        minLevel: 'WARN',
        outputHandler: (entry) => entries.push(entry),
      })

      customLogger.debug('Debug message')
      customLogger.info('Info message')
      customLogger.warn('Warning message')
      customLogger.error('Error message')
      customLogger.fatal('Fatal message')

      expect(entries).toHaveLength(3)
      expect(entries.map((e) => e.level)).toEqual(['WARN', 'ERROR', 'FATAL'])
    })

    it('captures DEBUG and INFO when minLevel is DEBUG', () => {
      const entries: LogEntry[] = []
      const customLogger = new Logger({
        minLevel: 'DEBUG',
        outputHandler: (entry) => entries.push(entry),
      })

      customLogger.debug('Diagnóstico')
      customLogger.info('Operação normal')

      expect(entries).toHaveLength(2)
      expect(entries[0]!.message).toBe('Diagnóstico')
      expect(entries[1]!.message).toBe('Operação normal')
    })
  })

  describe('Context propagation (withContext)', () => {
    it('inherits and merges context fields across calls', () => {
      const entries: LogEntry[] = []
      const rootLogger = new Logger({
        minLevel: 'DEBUG',
        defaultModule: 'api',
        outputHandler: (entry) => entries.push(entry),
      })

      const reqLogger = rootLogger.withContext({
        requestId: 'req-uuid-1234',
        userId: 'user-id-5678',
        module: 'catalog',
      })

      reqLogger.info('Livro cadastrado', {
        operation: 'create_book',
        context: { bookId: 'book-1' },
      })

      expect(entries).toHaveLength(1)
      const entry = entries[0]!
      expect(entry.requestId).toBe('req-uuid-1234')
      expect(entry.userId).toBe('user-id-5678')
      expect(entry.module).toBe('catalog')
      expect(entry.operation).toBe('create_book')
      expect(entry.context?.bookId).toBe('book-1')
    })
  })

  describe('Formatters: Dev vs Prod (JSON)', () => {
    it('emits valid JSON when in production mode', () => {
      let output = ''
      const prodLogger = new Logger({
        minLevel: 'INFO',
        isProduction: true,
        outputHandler: (_entry, formatted) => {
          output = formatted
        },
      })

      prodLogger.info('Evento importante', {
        requestId: 'req-abc',
        context: { valor: 42 },
      })

      const parsed = JSON.parse(output) as LogEntry
      expect(parsed.level).toBe('INFO')
      expect(parsed.message).toBe('Evento importante')
      expect(parsed.requestId).toBe('req-abc')
      expect(parsed.context?.valor).toBe(42)
      expect(parsed.timestamp).toBeDefined()
    })

    it('emits human-readable format with timestamp and modules in development mode', () => {
      let output = ''
      const devLogger = new Logger({
        minLevel: 'DEBUG',
        isProduction: false,
        outputHandler: (_entry, formatted) => {
          output = formatted
        },
      })

      devLogger.info('Mensagem legível', {
        requestId: 'req-test-999',
        module: 'auth',
      })

      expect(output).toContain('[INFO]')
      expect(output).toContain('[auth]')
      expect(output).toContain('[req:req-test]')
      expect(output).toContain('Mensagem legível')
    })
  })

  describe('Performance measurement (logger.measure)', () => {
    it('measures execution time and emits WARN when duration exceeds threshold', async () => {
      const entries: LogEntry[] = []
      const testLogger = new Logger({
        minLevel: 'DEBUG',
        outputHandler: (entry) => entries.push(entry),
      })

      // Simulate a slow operation with a 50ms sleep and 20ms threshold
      const result = await testLogger.measure(
        'slow_db_query',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 30))
          return 'sucesso'
        },
        {},
        { warnThresholdMs: 20 },
      )

      expect(result).toBe('sucesso')
      expect(entries.some((e) => e.level === 'WARN' && e.message.includes('Operação lenta detectada'))).toBe(true)
      const warnEntry = entries.find((e) => e.level === 'WARN')!
      expect(warnEntry.durationMs).toBeGreaterThanOrEqual(20)
    })

    it('logs ERROR and rethrows when measured operation fails', async () => {
      const entries: LogEntry[] = []
      const testLogger = new Logger({
        minLevel: 'DEBUG',
        outputHandler: (entry) => entries.push(entry),
      })

      await expect(
        testLogger.measure('failing_op', async () => {
          throw new Error('Falha catastrófica')
        }),
      ).rejects.toThrow('Falha catastrófica')

      expect(entries).toHaveLength(1)
      expect(entries[0]!.level).toBe('ERROR')
      expect(entries[0]!.message).toContain('Operação falhou: failing_op')
      expect(entries[0]!.error?.message).toBe('Falha catastrófica')
    })
  })
})
