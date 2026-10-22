import { createError, getQuery, getRouterParam } from 'h3'
import { z } from 'zod'
import { commentQuerySchema } from '../../../../../shared/schemas/comment'
import { getCommentsForLog } from '../../../../services/comments'
import { defineApiHandler, parseOrThrow } from '../../../../utils/api'
import { getSessionUser } from '../../../../utils/session'

const idSchema = z.string().uuid()

export default defineApiHandler(async (event) => {
  const parsed = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!parsed.success) throw createError({ statusCode: 404, data: { error: 'nao_encontrado', message: 'Conversa não encontrada.' } })
  const user = await getSessionUser(event)
  const viewer = user ? { id: user.id } : null
  const query = parseOrThrow(commentQuerySchema, getQuery(event))
  return await getCommentsForLog(parsed.data, viewer, query)
})
