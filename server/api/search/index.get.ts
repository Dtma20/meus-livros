import { getQuery } from 'h3'
import { searchQuerySchema } from '../../../shared/schemas/search'
import { recordSearchMiss, searchWorks } from '../../services/search'
import { defineApiHandler, parseOrThrow } from '../../utils/api'
import { getSessionUser } from '../../utils/session'

/**
 * GET /api/search?q=
 *
 * - No authentication required.
 * - q trimmed, 2–100 chars. Shorter → 200 { works: [] }.
 * - At most 20 results.
 * - Zero results → fire-and-forget insert into search_misses.
 * - Rate limit 120/IP/hour is handled at the infrastructure level (TASK-024).
 */
export default defineApiHandler(async (event) => {
  const { q } = parseOrThrow(searchQuerySchema, getQuery(event))

  // Under 2 chars: return empty array, not an error.
  if (q.length < 2) {
    return { works: [] }
  }

  // Resolved once: the viewer decides which reading logs count toward a work's
  // log_count, and it is also what the miss is attributed to.
  const user = await getSessionUser(event)
  const viewer = user ? { id: user.id } : null

  const works = await searchWorks(q, viewer)

  if (works.length === 0) {
    // Telemetry is fire-and-forget: it must never block or fail the search.
    recordSearchMiss(q, viewer?.id ?? null)
  }

  return { works }
})
