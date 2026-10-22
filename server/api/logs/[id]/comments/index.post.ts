import { createError, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { commentInputSchema } from '../../../../../shared/schemas/comment'
import { createComment } from '../../../../services/comments'
import { defineApiHandler, parseOrThrow } from '../../../../utils/api'
import { requireSessionUser } from '../../../../utils/session'

const idSchema = z.string().uuid()

export default defineApiHandler(async (event) => {
  const user = await requireSessionUser(event)
  const parsed = idSchema.safeParse(getRouterParam(event, 'id'))
  if (!parsed.success) throw createError({ statusCode: 404, data: { error: 'nao_encontrado', message: 'Conversa não encontrada.' } })
  const input = parseOrThrow(commentInputSchema, await readBody(event))
  return await createComment(parsed.data, user.id, input)
})
