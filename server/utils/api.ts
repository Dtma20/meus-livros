import type { EventHandler, EventHandlerRequest, H3Event } from 'h3'
import { createError, defineEventHandler, getRequestHeader, getResponseStatus, isError, setResponseHeader, setResponseStatus } from 'h3'
import type { ZodType } from 'zod'
import { logger } from './logger'

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

type PostgresErrorLike = Error & { code: string; detail?: string; constraint_name?: string }

function isPostgresError(err: unknown): err is PostgresErrorLike {
  return (
    err instanceof Error &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string' &&
    ((err as { name?: string }).name === 'PostgresError' || 'routine' in err)
  )
}

function findPostgresError(err: unknown): PostgresErrorLike | null {
  if (isPostgresError(err)) {
    return err
  }
  if (err instanceof Error) {
    const cause: unknown = (err as { cause?: unknown }).cause
    if (isPostgresError(cause)) {
      return cause
    }
  }
  return null
}

// 22007/22008: invalid datetime format; 22003: numeric out of range; 22P02: invalid text representation.
const INVALID_INPUT_PG_CODES = new Set(['22007', '22008', '22003', '22P02'])

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
      // The auth catch-all returns a Response whose status (a rejected sign-in is 400) is not on the event.
      const statusCode = result instanceof Response ? result.status : getResponseStatus(event)

      if (durationMs >= 1000) {
        logger.warn(`Requisição lenta à API: ${method} ${path} demorou ${durationMs}ms`, {
          ...reqContext,
          durationMs,
          http: { method, path, statusCode, durationMs },
        })
      } else if (method !== 'GET') {
        logger.info(`API ${method} ${path} concluída (${statusCode})`, {
          ...reqContext,
          durationMs,
          http: { method, path, statusCode, durationMs },
        })
      } else {
        logger.debug(`API ${method} ${path} concluída`, {
          ...reqContext,
          durationMs,
          http: { method, path, statusCode, durationMs },
        })
      }

      return result
    } catch (caught) {
      const durationMs = Math.round(performance.now() - startTime)

      if (isError(caught)) {
        const statusCode = caught.statusCode || 500
        setResponseStatus(event, statusCode)

        // An h3 error without data (a malformed JSON body from readBody, for one) carries an English
        // statusMessage such as "Bad Request"; the client gets the documented code and Portuguese copy instead.
        const data = (caught.data as ApiError | undefined) ?? (statusCode >= 500
          ? { error: 'erro_interno', message: 'Não foi possível completar a operação.' }
          : statusCode === 400
            ? { error: 'validacao', message: 'Corpo da requisição inválido.' }
            : { error: 'erro_requisicao', message: 'Não foi possível completar a operação.' })

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

      const pgError = findPostgresError(caught)
      if (pgError) {
        logger.error(`Erro de banco de dados no endpoint ${method} ${path} [Postgres ${pgError.code}]`, {
          ...reqContext,
          durationMs,
          source: 'database',
          error: {
            name: pgError.name,
            message: pgError.message,
            code: pgError.code,
            stack: pgError.stack,
            details: {
              detail: pgError.detail,
              constraint: pgError.constraint_name,
            },
          },
        })

        if (pgError.code === '23505') {
          setResponseStatus(event, 409)
          return {
            error: 'conflito',
            message: 'O registro já existe no sistema.',
            requestId,
          }
        }

        if (pgError.code === '23503') {
          setResponseStatus(event, 400)
          return {
            error: 'referencia_invalida',
            message: 'Referência a recurso inexistente.',
            requestId,
          }
        }

        if (pgError.code === '57014') {
          setResponseStatus(event, 504)
          return {
            error: 'tempo_esgotado',
            message: 'A operação no banco de dados demorou demais.',
            requestId,
          }
        }

        // Input the database rejects (bad date, number out of range, malformed text)
        // is the client's fault: 400, never the raw Postgres message.
        if (INVALID_INPUT_PG_CODES.has(pgError.code)) {
          setResponseStatus(event, 400)
          return {
            error: 'validacao',
            message: 'Dados inválidos.',
            requestId,
          }
        }

        setResponseStatus(event, 500)
        return {
          error: 'erro_interno',
          message: 'Erro interno ao consultar dados.',
          requestId,
        }
      }

      logger.error(`[api] erro não tratado no endpoint ${method} ${path}`, {
        ...reqContext,
        durationMs,
        http: { method, path, statusCode: 500, durationMs },
        error: caught instanceof Error ? caught : new Error(String(caught)),
      })

      setResponseStatus(event, 500)
      return {
        error: 'erro_interno',
        message: 'Não foi possível completar a operação.',
        requestId,
      }
    }
  })
}

export function parseOrThrow<S extends ZodType>(schema: S, value: unknown): ReturnType<S['parse']> {
  const result = schema.safeParse(value)
  if (!result.success) {
    const first = result.error.issues[0]
    const path = first?.path.join('.')

    // One entry per field path, first message wins, so the client can show each error next to its input.
    const fields: Record<string, string> = {}
    for (const issue of result.error.issues) {
      const key = issue.path.join('.')
      if (!Object.hasOwn(fields, key)) {
        fields[key] = issue.message
      }
    }

    throw createError({
      statusCode: 400,
      data: {
        error: 'validacao',
        message: path
          ? `Campo inválido: ${path}. ${first?.message ?? ''}`.trim()
          : (first?.message ?? 'Dados inválidos.'),
        fields,
      },
    })
  }
  return result.data as ReturnType<S['parse']>
}
