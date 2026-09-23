import { createError, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { editionUpdateSchema } from '../../../shared/schemas/work'
import { updateEdition } from '../../services/catalog'
import { defineApiHandler, parseOrThrow } from '../../utils/api'
import { requireSessionUser } from '../../utils/session'

const idSchema = z.string().uuid()

/**
 * PATCH /api/editions/:id
 *
 * Editions are addressed directly rather than under their work: an edition id
 * is already unique, and the work it belongs to is not a fact the client needs
 * to get right for the update to be safe.
 */
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

  const input = parseOrThrow(editionUpdateSchema, await readBody(event))

  return updateEdition(parsed.data, input, user.id)
})
