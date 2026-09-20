import { createError, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { updateLogInputSchema } from '../../../shared/schemas/log'
import { updateLog } from '../../services/logs'
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
      data: { error: 'nao_encontrado', message: 'Entrada não encontrada.' },
    })
  }

  const input = parseOrThrow(updateLogInputSchema, await readBody(event))
  return await updateLog(parsed.data, input, user.id)
})
