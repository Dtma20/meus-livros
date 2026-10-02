import { createError, getRouterParam } from 'h3'
import { z } from 'zod'
import { deleteComment } from '../../../../services/comments'
import { defineApiHandler } from '../../../../utils/api'
import { requireSessionUser } from '../../../../utils/session'

const idSchema = z.string().uuid()

export default defineApiHandler(async (event) => {
  const user = await requireSessionUser(event)
  const logId = idSchema.safeParse(getRouterParam(event, 'id'))
  const commentId = idSchema.safeParse(getRouterParam(event, 'commentId'))
  if (!logId.success || !commentId.success) throw createError({ statusCode: 404, data: { error: 'nao_encontrado', message: 'Conversa não encontrada.' } })
  await deleteComment(logId.data, commentId.data, user.id)
  return { ok: true }
})
