import { getQuery } from 'h3'
import { feedQuerySchema } from '../../../shared/schemas/feed'
import { getRecentFeed } from '../../services/feed'
import { defineApiHandler, parseOrThrow } from '../../utils/api'
import { requireSessionUser } from '../../utils/session'

export default defineApiHandler(async (event) => {
  const sessionUser = await requireSessionUser(event)
  const query = parseOrThrow(feedQuerySchema, getQuery(event))

  return await getRecentFeed({ id: sessionUser.id }, query.limit)
})
