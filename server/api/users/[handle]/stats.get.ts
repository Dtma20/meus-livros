import { createError, getQuery, getRouterParam } from 'h3'
import { statsQuerySchema } from '../../../../shared/schemas/stats'
import { getReadingStats } from '../../../services/stats'
import { defineApiHandler, parseOrThrow } from '../../../utils/api'
import { getSessionUser } from '../../../utils/session'

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

  const query = parseOrThrow(statsQuerySchema, getQuery(event))
  const sessionUser = await getSessionUser(event)
  const viewer = sessionUser ? { id: sessionUser.id } : null

  return await getReadingStats(handle, viewer, query.ano ?? null)
})
