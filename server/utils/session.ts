import type { H3Event } from 'h3'
import { createError } from 'h3'
import { getSessionUserByHeaders } from '../services/auth'
import type { SessionUser } from '../services/auth'

export type { SessionUser }

export async function getSessionUser(event: H3Event): Promise<SessionUser | null> {
  const contextUser = event.context.user as SessionUser | undefined
  if (contextUser?.id) {
    return { id: contextUser.id, email: contextUser.email }
  }

  const user = await getSessionUserByHeaders(event.headers)
  if (user) {
    event.context.user = user
  }
  return user
}

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
