import { createError, getRouterParam, setResponseStatus } from 'h3'
import { z } from 'zod'
import { deleteEdition } from '../../services/catalog'
import { defineApiHandler } from '../../utils/api'
import { requireSessionUser } from '../../utils/session'

const idSchema = z.string().uuid()

/**
 * DELETE /api/editions/:id
 *
 * Unlike `DELETE /api/works/:id`, this is not blocked by existing reading logs:
 * `reading_logs.edition_id` is `ON DELETE set null` and is null for most logs
 * anyway.
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

  await deleteEdition(parsed.data, user.id)
  setResponseStatus(event, 204)
  return null
})
