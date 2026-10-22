import { createError, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { readingBlockInputSchema } from '~~/shared/schemas/reading-block'
import { createBlock } from '../../../../services/reading-blocks'
import { defineApiHandler, parseOrThrow } from '../../../../utils/api'
import { requireSessionUser } from '../../../../utils/session'

const idSchema = z.string().uuid()

export default defineApiHandler(async (event) => {
  const user = await requireSessionUser(event)
  const id = getRouterParam(event, 'id')
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) {
    throw createError({
      statusCode: 404,
      data: { error: 'nao_encontrado', message: 'Entrada não encontrada.' },
    })
  }

  const body = await readBody(event)
  const input = parseOrThrow(readingBlockInputSchema, body)

  return await createBlock(parsedId.data, user.id, input)
})
