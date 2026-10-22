import { createError, getRouterParam, setResponseStatus } from 'h3'
import { z } from 'zod'
import { deleteEdition } from '../../services/catalog'
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
      data: { error: 'nao_encontrado', message: 'Edição não encontrada.' },
    })
  }

  await deleteEdition(parsed.data, user.id)
  setResponseStatus(event, 204)
  return null
})
