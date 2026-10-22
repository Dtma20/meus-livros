export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL'

export type LogSource = 'client' | 'server_api' | 'service' | 'database' | 'external_api'

export interface LogHttpInfo {
  method?: string
  path?: string
  statusCode?: number
  durationMs?: number
  ip?: string
  userAgent?: string
}

export interface LogErrorInfo {
  name?: string
  message: string
  code?: string | number
  stack?: string
  details?: unknown
  isTransient?: boolean
}

export interface LogContext {
  module?: string
  feature?: string
  operation?: string
  requestId?: string
  operationId?: string
  userId?: string
  source?: LogSource
  http?: LogHttpInfo
  durationMs?: number
  attempt?: number
  maxAttempts?: number
  error?: LogErrorInfo
  [key: string]: unknown
}

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  module: string
  feature?: string
  operation?: string
  requestId?: string
  operationId?: string
  userId?: string
  source?: LogSource
  http?: LogHttpInfo
  durationMs?: number
  attempt?: number
  maxAttempts?: number
  context?: Record<string, unknown>
  error?: LogErrorInfo
}

export interface ClientErrorPayload {
  message: string
  name?: string
  stack?: string
  url?: string
  requestId?: string
  component?: string
  context?: Record<string, unknown>
}
