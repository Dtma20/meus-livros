import { createError, getRouterParam, readBody, setResponseStatus } from 'h3'
import { z } from 'zod'
import { editionInputSchema } from '../../../../shared/schemas/work'
import { createEdition } from '../../../services/catalog'
import { defineApiHandler, parseOrThrow } from '../../../utils/api'
import { requireSessionUser } from '../../../utils/session'

const workIdSchema = z.string().uuid()

export default defineApiHandler(async (event) => {
  const user = await requireSessionUser(event)

  const id = getRouterParam(event, 'id')
  const parsed = workIdSchema.safeParse(id)
  // A malformed id and an id nobody has are the same answer: it does not exist.
  if (!parsed.success) {
    throw createError({
      statusCode: 404,
      data: { error: 'nao_encontrado', message: 'Obra não encontrada.' },
    })
  }

  const input = parseOrThrow(editionInputSchema, await readBody(event))

  const edition = await createEdition(parsed.data, input, user.id)
  setResponseStatus(event, 201)
  return edition
})
