import type { H3Event } from 'h3'
import { createError, toWebRequest } from 'h3'
import { getSessionUserByHeaders } from '../services/auth'
import type { SessionUser } from '../services/auth'

export type { SessionUser }

/**
 * The single seam between the catalogue and authentication.
 *
 * Checks event.context.user first (preserving existing test stubs),
 * then validates the database-backed session token via better-auth.
 */
export async function getSessionUser(event: H3Event): Promise<SessionUser | null> {
  const contextUser = event.context.user as SessionUser | undefined
  if (contextUser?.id) {
    return { id: contextUser.id, email: contextUser.email }
  }

  const req = toWebRequest(event)
  const user = await getSessionUserByHeaders(req.headers)
  if (user) {
    event.context.user = user
  }
  return user
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
