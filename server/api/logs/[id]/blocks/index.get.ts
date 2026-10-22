import { createError, getRouterParam } from 'h3'
import { z } from 'zod'
import { getBlocksForLog } from '../../../../services/reading-blocks'
import { defineApiHandler } from '../../../../utils/api'
import { getSessionUser } from '../../../../utils/session'

const idSchema = z.string().uuid()

export default defineApiHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) {
    throw createError({
      statusCode: 404,
      data: { error: 'nao_encontrado', message: 'Entrada não encontrada.' },
    })
  }

  const user = await getSessionUser(event)
  const viewer = user ? { id: user.id } : null

  return await getBlocksForLog(parsed.data, viewer)
})
