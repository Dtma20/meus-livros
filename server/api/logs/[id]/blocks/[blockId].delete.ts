import { createError, getRouterParam } from 'h3'
import { z } from 'zod'
import { deleteBlock } from '../../../../services/reading-blocks'
import { defineApiHandler } from '../../../../utils/api'
import { requireSessionUser } from '../../../../utils/session'

const uuidSchema = z.string().uuid()

export default defineApiHandler(async (event) => {
  const user = await requireSessionUser(event)
  const logId = getRouterParam(event, 'id')
  const parsedLogId = uuidSchema.safeParse(logId)
  if (!parsedLogId.success) {
    throw createError({
      statusCode: 404,
      data: { error: 'nao_encontrado', message: 'Registro de leitura não encontrado.' },
    })
  }

  const blockId = getRouterParam(event, 'blockId')
  const parsedBlockId = uuidSchema.safeParse(blockId)
  if (!parsedBlockId.success) {
    throw createError({
      statusCode: 404,
      data: { error: 'nao_encontrado', message: 'Bloco de leitura não encontrado.' },
    })
  }

  await deleteBlock(parsedBlockId.data, user.id, parsedLogId.data)
  return { ok: true }
})
