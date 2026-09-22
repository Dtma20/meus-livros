import { createError, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { updateReadingBlockInputSchema } from '~~/shared/schemas/reading-block'
import { updateBlock } from '../../../../services/reading-blocks'
import { defineApiHandler, parseOrThrow } from '../../../../utils/api'
import { requireSessionUser } from '../../../../utils/session'

const uuidSchema = z.string().uuid()

export default defineApiHandler(async (event) => {
  const user = await requireSessionUser(event)
  const blockId = getRouterParam(event, 'blockId')
  const parsedBlockId = uuidSchema.safeParse(blockId)
  if (!parsedBlockId.success) {
    throw createError({
      statusCode: 404,
      data: { error: 'nao_encontrado', message: 'Bloco de leitura não encontrado.' },
    })
  }

  const body = await readBody(event)
  const input = parseOrThrow(updateReadingBlockInputSchema, body)

  return await updateBlock(parsedBlockId.data, user.id, input)
})
