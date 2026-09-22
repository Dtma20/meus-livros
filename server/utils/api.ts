import type { EventHandler, EventHandlerRequest, H3Event } from 'h3'
import { createError, defineEventHandler, getRequestHeader, isError, setResponseHeader, setResponseStatus } from 'h3'
import type { ZodType } from 'zod'
import { logger } from './logger'

/**
 * The one place the project's error shape is produced.
 *
 * Routes stay thin — validate, authorise, call a service, shape the response —
 * and services throw `createError({ statusCode, data })`. This wrapper turns
 * that into the documented body, attaches the correlation/request ID, logs the
 * outcome at the appropriate level, and keeps h3's default envelope, which
 * carries a stack trace, off the wire.
 */
export interface ApiError {
  error: string
  message: string
  requestId?: string
  [key: string]: unknown
}

function resolveRequestId(event: H3Event): string {
  const existing =
    (event.context?.requestId as string | undefined) ||
    getRequestHeader(event, 'x-request-id') ||
    getRequestHeader(event, 'x-correlation-id')

  if (existing && typeof existing === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(existing)) {
    return existing
  }

  const generated = crypto.randomUUID()
  if (event.context) {
    event.context.requestId = generated
  }
  return generated
}

function isPostgresError(err: unknown): err is Error & { code: string; detail?: string; constraint_name?: string } {
  return (
    err instanceof Error &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string' &&
    ((err as { name?: string }).name === 'PostgresError' || 'routine' in err)
  )
}

export function defineApiHandler<T extends EventHandlerRequest, D>(
  handler: (event: H3Event<T>) => Promise<D>,
): EventHandler<T, Promise<D | ApiError>> {
  return defineEventHandler(async (event) => {
    const startTime = (event.context?.startTime as number | undefined) ?? performance.now()
    const requestId = resolveRequestId(event)
    if (event.node?.res && typeof (event.node.res as { setHeader?: unknown }).setHeader === 'function') {
      setResponseHeader(event, 'x-request-id', requestId)
    }

    const method = (event.method || event.node?.req?.method || 'UNKNOWN').toUpperCase()
    const path = (event.path || event.node?.req?.url || '/').split('?')[0]
    const userId = (event.context?.user as { id?: string } | undefined)?.id

    const reqContext = {
      module: 'api',
      requestId,
      userId,
      http: {
        method,
        path,
      },
    }

    try {
      const result = await handler(event)
      const durationMs = Math.round(performance.now() - startTime)

      // Emit slow operation warning if API response crosses threshold (1s)
      if (durationMs >= 1000) {
        logger.warn(`Requisição lenta à API: ${method} ${path} demorou ${durationMs}ms`, {
          ...reqContext,
          durationMs,
          http: { method, path, statusCode: 200, durationMs },
        })
      } else if (method !== 'GET') {
        // Log state mutations at INFO level
        logger.info(`API ${method} ${path} concluída com sucesso`, {
          ...reqContext,
          durationMs,
          http: { method, path, statusCode: 200, durationMs },
        })
      } else {
        // Log reads at DEBUG level to avoid noisy production logs
        logger.debug(`API ${method} ${path} concluída`, {
          ...reqContext,
          durationMs,
          http: { method, path, statusCode: 200, durationMs },
        })
      }

      return result
    } catch (caught) {
      const durationMs = Math.round(performance.now() - startTime)

      // 1. Handled H3 Errors (thrown intentionally by services / validations)
      if (isError(caught)) {
        const statusCode = caught.statusCode || 500
        setResponseStatus(event, statusCode)

        const data = (caught.data as ApiError | undefined) ?? {
          error: statusCode >= 500 ? 'erro_inesperado' : 'erro_requisicao',
          message: caught.statusMessage || 'Não foi possível completar a operação.',
        }

        const responseData: ApiError = {
          ...data,
          requestId,
        }

        if (statusCode >= 500) {
          logger.error(`API ${method} ${path} falhou com erro ${statusCode}`, {
            ...reqContext,
            durationMs,
            http: { method, path, statusCode, durationMs },
            error: caught,
          })
        } else {
          logger.warn(`API ${method} ${path} retornou ${statusCode}: ${data.error}`, {
            ...reqContext,
            durationMs,
            http: { method, path, statusCode, durationMs },
            error: caught,
          })
        }

        return responseData
      }

      // 2. Postgres Database Errors (mapped to safe project error shapes)
      if (isPostgresError(caught)) {
        // Log detailed DB error with stack and details on server only
        logger.error(`Erro de banco de dados no endpoint ${method} ${path} [Postgres ${caught.code}]`, {
          ...reqContext,
          durationMs,
          source: 'database',
          error: {
            name: caught.name,
            message: caught.message,
            code: caught.code,
            stack: caught.stack,
            details: {
              detail: caught.detail,
              constraint: caught.constraint_name,
            },
          },
        })

        if (caught.code === '23505') {
          // Unique violation
          setResponseStatus(event, 409)
          return {
            error: 'conflito',
            message: 'O registro já existe no sistema.',
            requestId,
          }
        }

        if (caught.code === '23503') {
          // Foreign key violation
          setResponseStatus(event, 400)
          return {
            error: 'referencia_invalida',
            message: 'Referência a recurso inexistente.',
            requestId,
          }
        }

        if (caught.code === '57014') {
          // Query canceled / statement timeout
          setResponseStatus(event, 504)
          return {
            error: 'tempo_esgotado',
            message: 'A operação no banco de dados demorou demais.',
            requestId,
          }
        }

        // Generic database error fallback (never leak SQL or table names)
        setResponseStatus(event, 500)
        return {
          error: 'erro_banco',
          message: 'Erro interno ao consultar dados.',
          requestId,
        }
      }

      // 3. Unhandled exceptions (never leak internal stack traces)
      logger.error(`[api] erro não tratado no endpoint ${method} ${path}`, {
        ...reqContext,
        durationMs,
        http: { method, path, statusCode: 500, durationMs },
        error: caught instanceof Error ? caught : new Error(String(caught)),
      })

      setResponseStatus(event, 500)
      return {
        error: 'erro_inesperado',
        message: 'Não foi possível completar a operação.',
        requestId,
      }
    }
  })
}

/**
 * Parse with Zod and fail in the project's error shape.
 *
 * Client-side validation is a convenience; this is the gate.
 */
export function parseOrThrow<S extends ZodType>(schema: S, value: unknown): ReturnType<S['parse']> {
  const result = schema.safeParse(value)
  if (!result.success) {
    const first = result.error.issues[0]
    const path = first?.path.join('.')
    throw createError({
      statusCode: 400,
      data: {
        error: 'requisicao_invalida',
        message: path
          ? `Campo inválido: ${path}. ${first?.message ?? ''}`.trim()
          : (first?.message ?? 'Dados inválidos.'),
      },
    })
  }
  return result.data as ReturnType<S['parse']>
}
