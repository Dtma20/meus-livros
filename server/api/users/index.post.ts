import { createError, readBody, setResponseStatus } from 'h3'
import { createUserSchema } from '../../../shared/schemas/user'
import { auth } from '../../services/auth'
import { createUser } from '../../services/users'
import { defineApiHandler, parseOrThrow } from '../../utils/api'

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

  const body = await readBody(event)
  const input = parseOrThrow(createUserSchema, body)

  const user = await createUser({
    email,
    handle: input.handle,
    display_name: input.display_name,
  })

  setResponseStatus(event, 201)
  return {
    id: user.id,
    handle: user.handle,
    display_name: user.display_name,
  }
})
