import { getQuery } from 'h3'
import { feedQuerySchema } from '../../../shared/schemas/feed'
import { getRecentFeed } from '../../services/feed'
import { defineApiHandler, parseOrThrow } from '../../utils/api'
import { requireSessionUser } from '../../utils/session'

/**
 * GET /api/feed/recentes?limit=10
 *
 * Returns up to 10 most recent visible reading logs.
 *
 * Rules:
 * - Auth: required. The home page is the only caller and it shows the feed to
 *   members only, so an anonymous request has nothing to collect here. Answering
 *   401 before touching the database is what keeps a bot hitting the public
 *   landing page from costing two Neon queries it will never read.
 * - Enforces visibleLogs(viewer). The anonymous branch of that helper is still
 *   the right thing at the service layer and is covered there; it is this route
 *   that has no anonymous caller.
 * - limit capped at 10 server-side regardless of query string.
 * - ORDER BY created_at DESC LIMIT 10.
 */
export default defineApiHandler(async (event) => {
  const sessionUser = await requireSessionUser(event)
  const query = parseOrThrow(feedQuerySchema, getQuery(event))

  return await getRecentFeed({ id: sessionUser.id }, query.limit)
})
