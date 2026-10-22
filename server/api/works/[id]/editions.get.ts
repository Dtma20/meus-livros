import { createError, getRouterParam } from 'h3'
import { z } from 'zod'
import { getEditionsForWork } from '../../../services/logs'
import { defineApiHandler } from '../../../utils/api'

const idSchema = z.string().uuid()

export default defineApiHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) {
    throw createError({
      statusCode: 404,
      data: { error: 'nao_encontrado', message: 'Obra não encontrada.' },
    })
  }

  const editions = await getEditionsForWork(parsed.data)
  return { editions }
})
