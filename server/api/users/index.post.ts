import { createError, readBody, setResponseStatus, toWebRequest } from 'h3'
import { createUserSchema } from '../../../shared/schemas/user'
import { auth } from '../../services/auth'
import { createUser } from '../../services/users'
import { defineApiHandler, parseOrThrow } from '../../utils/api'

/**
 * POST /api/users
 *
 * Creates the user's profile row after initial sign-in.
 * Accepts { handle, display_name }.
 *
 * Security:
 * - Session is verified via better-auth database session (never trusts email from body).
 * - Allowlist membership is re-verified at profile creation time.
 * - Reserved handles and collisions return 409 with suggestions.
 * - A second submission returns 409.
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

  // 2. Parse and validate body
  const body = await readBody(event)
  const input = parseOrThrow(createUserSchema, body)

  // 3. Create profile via user service (handles allowlist re-check, collision, and reserved words)
  const user = await createUser({
    email,
    handle: input.handle,
    display_name: input.display_name,
  })

  // 4. Return 201 with created profile summary
  setResponseStatus(event, 201)
  return {
    id: user.id,
    handle: user.handle,
    display_name: user.display_name,
  }
})
