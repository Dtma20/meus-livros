import { getQuery } from 'h3'
import { feedCursorQuerySchema } from '../../../shared/schemas/feed'
import { getFeedPage } from '../../services/feed'
import { defineApiHandler, parseOrThrow } from '../../utils/api'
import { requireSessionUser } from '../../utils/session'

export default defineApiHandler(async (event) => {
  const sessionUser = await requireSessionUser(event)
  const query = parseOrThrow(feedCursorQuerySchema, getQuery(event))

  return await getFeedPage({ id: sessionUser.id }, {
    cursor: query.cursor,
    limit: query.limit,
  })
})
