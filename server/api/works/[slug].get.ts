import { createError, getRouterParam } from 'h3'
import { z } from 'zod'
import { getWorkBySlug } from '../../services/works'
import { defineApiHandler } from '../../utils/api'
import { getSessionUser } from '../../utils/session'

const slugSchema = z.string().trim().min(1).max(120)

export default defineApiHandler(async (event) => {
  const rawSlug = getRouterParam(event, 'slug') || getRouterParam(event, 'id')
  if (!rawSlug) {
    throw createError({
      statusCode: 404,
      data: { error: 'nao_encontrado', message: 'Obra não encontrada.' },
    })
  }

  const parsed = slugSchema.safeParse(rawSlug)
  if (!parsed.success) {
    throw createError({
      statusCode: 404,
      data: { error: 'nao_encontrado', message: 'Obra não encontrada.' },
    })
  }

  const user = await getSessionUser(event)
  const viewer = user ? { id: user.id } : null

  return await getWorkBySlug(parsed.data, viewer)
})
