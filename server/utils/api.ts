import type { EventHandler, EventHandlerRequest, H3Event } from 'h3'
import { createError, defineEventHandler, isError, setResponseStatus } from 'h3'
import type { ZodType } from 'zod'

/**
 * The one place the project's error shape is produced.
 *
 * Routes stay thin — validate, authorise, call a service, shape the response —
 * and services throw `createError({ statusCode, data })`. This wrapper turns
 * that into the documented body and keeps h3's default envelope, which carries
 * a stack trace, off the wire.
 */
export interface ApiError {
  error: string
  message: string
  [key: string]: unknown
}

export function defineApiHandler<T extends EventHandlerRequest, D>(
  handler: (event: H3Event<T>) => Promise<D>,
): EventHandler<T, Promise<D | ApiError>> {
  return defineEventHandler(async (event) => {
    try {
      return await handler(event)
    } catch (caught) {
      if (isError(caught)) {
        const data = caught.data as ApiError | undefined
        setResponseStatus(event, caught.statusCode || 500)
        if (data?.error) return data
        return { error: 'erro_inesperado', message: 'Não foi possível completar a operação.' }
      }

      // Never let a database message or a stack trace reach the client.
      console.error('[api] erro não tratado:', caught)
      setResponseStatus(event, 500)
      return { error: 'erro_inesperado', message: 'Não foi possível completar a operação.' }
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
