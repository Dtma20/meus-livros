import { createError, getRouterParam } from 'h3'
import { getProfileByHandle } from '../../services/profiles'
import { defineApiHandler } from '../../utils/api'
import { getSessionUser } from '../../utils/session'

/**
 * GET /api/users/:handle
 *
 * Returns user profile, visible reading logs, and collection stats.
 *
 * Responses:
 * - 200 with ProfileResponse: profile found and visible
 * - 404: unknown handle, or private profile viewed by non-owner
 */
export default defineApiHandler(async (event) => {
  const handle = getRouterParam(event, 'handle')
  if (!handle) {
    throw createError({
      statusCode: 404,
      data: {
        error: 'nao_encontrado',
        message: 'Perfil não encontrado.',
      },
    })
  }

  const sessionUser = await getSessionUser(event)
  const viewer = sessionUser ? { id: sessionUser.id } : null

  return await getProfileByHandle(handle, viewer)
})
