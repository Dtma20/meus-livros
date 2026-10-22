import { createError, getRouterParam, setResponseStatus } from 'h3'
import { z } from 'zod'
import { deleteWork } from '../../services/catalog'
import { defineApiHandler } from '../../utils/api'
import { requireSessionUser } from '../../utils/session'

const idSchema = z.string().uuid()

export default defineApiHandler(async (event) => {
  const user = await requireSessionUser(event)

  const id = getRouterParam(event, 'id')
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) {
    throw createError({
      statusCode: 404,
      data: { error: 'nao_encontrado', message: 'Obra não encontrada.' },
    })
  }

  await deleteWork(parsed.data, user.id)
  setResponseStatus(event, 204)
  return null
})
