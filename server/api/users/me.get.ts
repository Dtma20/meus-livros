import { createError } from 'h3'
import { auth } from '../../services/auth'
import { getUserByEmail } from '../../services/users'
import { defineApiHandler } from '../../utils/api'

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
    const session = await auth.api.getSession({ headers: event.headers })
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

  // One lookup, keyed by the email the session above already proved.
  // getSessionUser() would validate the same cookie a second time and
  // getUserById() would then re-fetch by id the row it just found by email:
  // four round trips for a question that takes two. A verified identity with
  // no `users` row still answers 200 null -- that is what "no profile yet"
  // means, and it is why the 401 above is decided on `email`, not on this row.
  const user = await getUserByEmail(email)
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
