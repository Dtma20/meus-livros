import { createError, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { workUpdateSchema } from '../../../shared/schemas/work'
import { updateWork } from '../../services/catalog'
import { defineApiHandler, parseOrThrow } from '../../utils/api'
import { requireSessionUser } from '../../utils/session'

const idSchema = z.string().uuid()

/**
 * PATCH /api/works/:id
 *
 * Any member with a session may correct any work — see the module comment in
 * `services/catalog.ts` for why it is not restricted to the creator.
 */
export default defineApiHandler(async (event) => {
  const user = await requireSessionUser(event)

  const id = getRouterParam(event, 'id')
  const parsed = idSchema.safeParse(id)
  // A malformed id and an id nobody has are the same answer: it does not exist.
  if (!parsed.success) {
    throw createError({
      statusCode: 404,
      data: { error: 'nao_encontrado', message: 'Obra não encontrada.' },
    })
  }

  const input = parseOrThrow(workUpdateSchema, await readBody(event))

  return updateWork(parsed.data, input, user.id)
})
