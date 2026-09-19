import type { H3Event } from 'h3'
import { createError } from 'h3'

/**
 * The single seam between the catalogue and authentication.
 *
 * TASK-007 replaces the body of `getSessionUser` with a better-auth lookup.
 * Everything else in the codebase asks through here, so that task changes one
 * function rather than every route.
 */
export interface SessionUser {
  id: string
}

export async function getSessionUser(event: H3Event): Promise<SessionUser | null> {
  const user = event.context.user as SessionUser | undefined
  return user?.id ? { id: user.id } : null
}

/** The session, or a 401 in the project's error shape. */
export async function requireSessionUser(event: H3Event): Promise<SessionUser> {
  const user = await getSessionUser(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      data: { error: 'nao_autenticado', message: 'É necessário entrar para continuar.' },
    })
  }
  return user
}
