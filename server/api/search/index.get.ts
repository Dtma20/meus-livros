import { getQuery } from 'h3'
import { searchQuerySchema } from '../../../shared/schemas/search'
import { recordSearchMiss, searchHybridWorks, searchWorks } from '../../services/search'
import { defineApiHandler, parseOrThrow } from '../../utils/api'
import { getSessionUser } from '../../utils/session'

/**
 * GET /api/search?q=
 *
 * - No authentication required.
 * - q trimmed, 2–100 chars. Shorter → 200 { works: [] }.
 * - Hybrid search: local prioritized + Open Library automatic complement.
 * - Zero results → fire-and-forget insert into search_misses.
 */
export default defineApiHandler(async (event) => {
  const query = getQuery(event)
  const { q } = parseOrThrow(searchQuerySchema, query)

  // Under 2 chars: return empty array, not an error.
  if (q.length < 2) {
    return { works: [] }
  }

  const user = await getSessionUser(event)
  const viewer = user ? { id: user.id } : null

  const works = query.local === 'true' || query.local === '1'
    ? await searchWorks(q, viewer)
    : await searchHybridWorks(q, viewer)

  if (works.length === 0) {
    recordSearchMiss(q, viewer?.id ?? null)
  }

  return { works }
})
