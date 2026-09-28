import { createError } from 'h3'
import { auth } from '../../services/auth'
import { getUserByEmail } from '../../services/users'
import { defineApiHandler } from '../../utils/api'

export default defineApiHandler(async (event) => {
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
    is_admin: user.is_admin,
  }
})
