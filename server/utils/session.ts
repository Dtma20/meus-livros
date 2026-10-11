import type { H3Event } from 'h3'
import { createError } from 'h3'
import { getSessionUserByHeaders } from '../services/auth'
import type { SessionUser } from '../services/auth'
import { getAdminUser } from '../services/invites'
import { checkRateLimit } from '../services/rate-limit'

export type { SessionUser }

// security.md §8: any authenticated write, per user per hour.
const WRITES_PER_HOUR = 200

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

  const method = (event.method || 'UNKNOWN').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') {
    await assertWriteBudget(`write:user:${user.id}`)
  }

  return user
}

export async function assertWriteBudget(userKey: string): Promise<void> {
  const allowed = await checkRateLimit(userKey, WRITES_PER_HOUR)
  if (!allowed) {
    throw createError({
      statusCode: 429,
      data: {
        error: 'muitas_tentativas',
        message: 'Muitas ações em pouco tempo. Aguarde e tente novamente.',
      },
    })
  }
}

export async function requireAdmin(event: H3Event): Promise<{ id: string; email: string }> {
  const user = await requireSessionUser(event)
  const admin = await getAdminUser(user.id)
  if (!admin) {
    throw createError({
      statusCode: 404,
      data: { error: 'nao_encontrado', message: 'Página não encontrada.' },
    })
  }
  return admin
}
