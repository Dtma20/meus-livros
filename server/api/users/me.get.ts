import { createError, toWebRequest } from 'h3'
import { auth } from '../../services/auth'
import { getUserById } from '../../services/users'
import { defineApiHandler } from '../../utils/api'
import { getSessionUser } from '../../utils/session'

/**
 * GET /api/users/me
 *
 * Returns the current authenticated user's profile.
 *
 * Responses:
 * - 200 with UserProfile: authenticated with a profile in `users`
 * - 200 with null: authenticated identity exists, but profile has not been created yet
 * - 401: unauthenticated (no session)
 */
export default defineApiHandler(async (event) => {
  // 1. Resolve verified email from better-auth session (or event context if stubbed)
  const contextUser = event.context.user as { email?: string; id?: string } | undefined
  let email = contextUser?.email?.trim().toLowerCase()

  if (!email) {
    const req = toWebRequest(event)
    const session = await auth.api.getSession({ headers: req.headers })
    if (session?.user?.email) {
      email = session.user.email.trim().toLowerCase()
    }
  }

  if (!email) {
    throw createError({
      statusCode: 401,
      data: {
        error: 'nao_autenticado',
        message: 'É necessário entrar para continuar.',
      },
    })
  }

  // 2. Check if a profile exists in the `users` table
  const sessionUser = await getSessionUser(event)
  if (!sessionUser) {
    return null
  }

  const user = await getUserById(sessionUser.id)
  if (!user) {
    return null
  }

  return {
    id: user.id,
    email: user.email,
    handle: user.handle,
    display_name: user.display_name,
    bio: user.bio,
    profile_visibility: user.profile_visibility,
  }
})
