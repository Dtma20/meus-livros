import type { LogContext, LogEntry, LogErrorInfo, LogLevel } from '../../shared/types/logger'
import { redactEmail } from './email'

const LEVEL_PRIORITIES: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4,
}

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /pass/i,
  /token/i,
  /secret/i,
  /hash/i,
  /otp/i,
  /cookie/i,
  /authorization/i,
  /session/i,
  /gmail_app_password/i,
  /better_auth_secret/i,
  /api[_-]?key/i,
  /credential/i,
]

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
const MAX_STRING_LENGTH = 4000

export type LogOutputHandler = (entry: LogEntry, formatted: string) => void

/**
 * Sanitizes arbitrary data to guarantee no sensitive credentials,
 * tokens, passwords, cookies, or raw email addresses reach stdout or log drains.
 */
export function sanitizeLogData(data: unknown, depth = 0, seen = new WeakSet()): unknown {
  if (depth > 6) return '[MAX_DEPTH]'
  if (data === null || data === undefined) return data

  if (typeof data === 'string') {
    // Redact emails embedded in strings
    let sanitized = data.replace(EMAIL_REGEX, (email) => redactEmail(email))
    if (sanitized.length > MAX_STRING_LENGTH) {
      sanitized = `${sanitized.slice(0, MAX_STRING_LENGTH)}… [TRUNCATED ${data.length - MAX_STRING_LENGTH} chars]`
    }
    return sanitized
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data
  }

  if (typeof data === 'bigint') {
    return data.toString()
  }

  if (data instanceof Error) {
    return {
      name: data.name,
      message: data.message.replace(EMAIL_REGEX, (email) => redactEmail(email)),
      stack: data.stack?.replace(EMAIL_REGEX, (email) => redactEmail(email)),
    }
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogData(item, depth + 1, seen))
  }

  if (typeof data === 'object') {
    if (seen.has(data)) return '[CIRCULAR]'
    seen.add(data)

    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data)) {
      const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))
      if (isSensitiveKey) {
        result[key] = '[REDACTED]'
      } else {
        result[key] = sanitizeLogData(value, depth + 1, seen)
      }
    }
    return result
  }

  return String(data)
}

export function parseError(err: unknown): LogErrorInfo {
  if (err instanceof Error) {
    const errorObj = err as Error & { code?: string | number; statusCode?: number; details?: unknown }
    return {
      name: err.name,
      message: err.message,
      code: errorObj.code ?? errorObj.statusCode,
      stack: err.stack,
      details: errorObj.details ? (sanitizeLogData(errorObj.details) as Record<string, unknown>) : undefined,
    }
  }

  if (typeof err === 'object' && err !== null) {
    const record = err as Record<string, unknown>
    return {
      name: String(record.name ?? 'ObjectError'),
      message: String(record.message ?? JSON.stringify(sanitizeLogData(err))),
      code: typeof record.code === 'string' || typeof record.code === 'number' ? record.code : undefined,
      stack: typeof record.stack === 'string' ? record.stack : undefined,
    }
  }

  return {
    name: 'UnknownError',
    message: String(err),
  }
}

export interface LoggerOptions {
  minLevel?: LogLevel
  defaultModule?: string
  outputHandler?: LogOutputHandler
  isProduction?: boolean
  baseContext?: LogContext
}

export class Logger {
  private minLevel: LogLevel
  private defaultModule: string
  private outputHandler?: LogOutputHandler
  private isProduction: boolean
  private baseContext: LogContext

  constructor(options: LoggerOptions = {}) {
    this.isProduction = options.isProduction ?? (process.env.NODE_ENV === 'production')
    this.defaultModule = options.defaultModule ?? 'app'
    this.baseContext = options.baseContext ?? {}
    this.outputHandler = options.outputHandler

    if (options.minLevel) {
      this.minLevel = options.minLevel
    } else if (process.env.LOG_LEVEL && process.env.LOG_LEVEL in LEVEL_PRIORITIES) {
      this.minLevel = process.env.LOG_LEVEL as LogLevel
    } else {
      this.minLevel = this.isProduction ? 'INFO' : 'DEBUG'
    }
  }

  public setMinLevel(level: LogLevel): void {
    this.minLevel = level
  }

  public setOutputHandler(handler?: LogOutputHandler): void {
    this.outputHandler = handler
  }

  public withContext(context: LogContext): Logger {
    return new Logger({
      minLevel: this.minLevel,
      defaultModule: context.module ?? this.defaultModule,
      outputHandler: this.outputHandler,
      isProduction: this.isProduction,
      baseContext: { ...this.baseContext, ...context },
    })
  }

  public isLevelEnabled(level: LogLevel): boolean {
    return LEVEL_PRIORITIES[level] >= LEVEL_PRIORITIES[this.minLevel]
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.isLevelEnabled(level)) return

    const mergedContext = { ...this.baseContext, ...context }
    const module = mergedContext.module ?? this.defaultModule
    const {
      feature,
      operation,
      requestId,
      operationId,
      userId,
      source,
      http,
      durationMs,
      attempt,
      maxAttempts,
      error: rawError,
      ...extraContext
    } = mergedContext

    let parsedErr: LogErrorInfo | undefined
    if (rawError) {
      parsedErr = parseError(rawError)
    }

    const explicitContext =
      typeof mergedContext.context === 'object' && mergedContext.context !== null
        ? (mergedContext.context as Record<string, unknown>)
        : {}
    const combinedContext = { ...extraContext, ...explicitContext }
    delete combinedContext.context

    const sanitizedExtra = Object.keys(combinedContext).length > 0
      ? (sanitizeLogData(combinedContext) as Record<string, unknown>)
      : undefined

    const sanitizedMessage = typeof message === 'string'
      ? message.replace(EMAIL_REGEX, (email) => redactEmail(email))
      : String(message)

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: sanitizedMessage,
      module,
      ...(feature ? { feature } : {}),
      ...(operation ? { operation } : {}),
      ...(requestId ? { requestId } : {}),
      ...(operationId ? { operationId } : {}),
      ...(userId ? { userId } : {}),
      ...(source ? { source } : {}),
      ...(http ? { http: sanitizeLogData(http) as LogEntry['http'] } : {}),
      ...(typeof durationMs === 'number' ? { durationMs } : {}),
      ...(typeof attempt === 'number' ? { attempt } : {}),
      ...(typeof maxAttempts === 'number' ? { maxAttempts } : {}),
      ...(sanitizedExtra ? { context: sanitizedExtra } : {}),
      ...(parsedErr ? { error: parsedErr } : {}),
    }

    const formatted = this.formatEntry(entry)

    if (this.outputHandler) {
      this.outputHandler(entry, formatted)
      return
    }

    const rawErrorArg =
      mergedContext._rawError ??
      (mergedContext.context as { _rawError?: unknown } | undefined)?._rawError

    if (level === 'ERROR' || level === 'FATAL') {
      if (rawErrorArg !== undefined) {
        console.error(formatted, rawErrorArg)
      } else {
        console.error(formatted)
      }
    } else if (level === 'WARN') {
      console.warn(formatted)
    } else {
      console.log(formatted)
    }
  }

  public debug(message: string, context?: LogContext): void {
    this.log('DEBUG', message, context)
  }

  public info(message: string, context?: LogContext): void {
    this.log('INFO', message, context)
  }

  public warn(message: string, context?: LogContext): void {
    this.log('WARN', message, context)
  }

  public error(message: string, context?: LogContext): void {
    this.log('ERROR', message, context)
  }

  public fatal(message: string, context?: LogContext): void {
    this.log('FATAL', message, context)
  }

  /**
   * Measures the execution time of an async or sync operation,
   * emits a WARN log if it crosses warnThresholdMs, and tracks failures.
   */
  public async measure<T>(
    operationName: string,
    fn: () => Promise<T> | T,
    context: LogContext = {},
    options: { warnThresholdMs?: number; logSuccess?: boolean } = {},
  ): Promise<T> {
    const start = performance.now()
    const warnThresholdMs = options.warnThresholdMs ?? 1000
    const opContext = { ...this.baseContext, ...context, operation: operationName }

    try {
      const result = await fn()
      const durationMs = Math.round(performance.now() - start)

      if (durationMs >= warnThresholdMs) {
        this.warn(`Operação lenta detectada: ${operationName} demorou ${durationMs}ms (limiar: ${warnThresholdMs}ms)`, {
          ...opContext,
          durationMs,
        })
      } else if (options.logSuccess) {
        this.info(`Operação concluída: ${operationName}`, {
          ...opContext,
          durationMs,
        })
      }

      return result
    } catch (err) {
      const durationMs = Math.round(performance.now() - start)
      this.error(`Operação falhou: ${operationName}`, {
        ...opContext,
        durationMs,
        error: parseError(err),
      })
      throw err
    }
  }

  private formatEntry(entry: LogEntry): string {
    if (this.isProduction || process.env.LOG_FORMAT === 'json') {
      return JSON.stringify(entry)
    }

    // Development readable format
    const time = entry.timestamp.slice(11, 23)
    const levelColors: Record<LogLevel, string> = {
      DEBUG: '\x1b[90m', // gray
      INFO: '\x1b[36m',  // cyan
      WARN: '\x1b[33m',  // yellow
      ERROR: '\x1b[31m', // red
      FATAL: '\x1b[35;1m', // bold magenta
    }
    const reset = '\x1b[0m'
    const color = levelColors[entry.level] || ''

    const parts: string[] = [
      `[${time}]`,
      `${color}[${entry.level}]${reset}`,
      `\x1b[34m[${entry.module}]\x1b[0m`,
    ]

    if (entry.requestId) {
      parts.push(`\x1b[32m[req:${entry.requestId.slice(0, 8)}]\x1b[0m`)
    }

    if (entry.operation) {
      parts.push(`(${entry.operation})`)
    }

    parts.push(entry.message)

    if (typeof entry.durationMs === 'number') {
      parts.push(`\x1b[90m(${entry.durationMs}ms)\x1b[0m`)
    }

    if (entry.attempt && entry.maxAttempts) {
      parts.push(`\x1b[33m[tentativa ${entry.attempt}/${entry.maxAttempts}]\x1b[0m`)
    }

    let out = parts.join(' ')

    if (entry.context && Object.keys(entry.context).length > 0) {
      out += `\n  Contexto: ${JSON.stringify(entry.context)}`
    }

    if (entry.error) {
      out += `\n  Erro: ${entry.error.name}: ${entry.error.message}`
      if (entry.error.stack && (entry.level === 'ERROR' || entry.level === 'FATAL')) {
        out += `\n  ${entry.error.stack}`
      }
    }

    return out
  }
}

export const logger = new Logger()
