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

  const works = await searchWorks(q)

  if (works.length === 0) {
    // Session is optional for search; userId may be null.
    // Telemetry is fire-and-forget: errors must never block or fail the search response.
    try {
      const user = await getSessionUser(event)
      recordSearchMiss(q, user?.id ?? null)
    } catch (err: unknown) {
      console.error('[search] error determining user for search miss:', err)
      recordSearchMiss(q, null)
    }
  }

  return { works }
})
