import { createError, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { workUpdateSchema } from '../../../shared/schemas/work'
import { updateWork } from '../../services/catalog'
import { defineApiHandler, parseOrThrow } from '../../utils/api'
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

  const input = parseOrThrow(workUpdateSchema, await readBody(event))

  return updateWork(parsed.data, input, user.id)
})
