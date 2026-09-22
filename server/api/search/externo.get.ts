import { createError, getQuery } from 'h3'
import { searchQuerySchema } from '../../../shared/schemas/search'
import { searchOpenLibrary } from '../../services/open-library'
import { checkRateLimit } from '../../services/rate-limit'
import { defineApiHandler, parseOrThrow } from '../../utils/api'
import { requireSessionUser } from '../../utils/session'

const EXTERNAL_LOOKUP_LIMIT_PER_HOUR = 20

/**
 * GET /api/search/externo?q=
 *
 * - Session is REQUIRED so anonymous traffic cannot use us as a proxy to a free public API.
 * - Rate limit: 20 lookups per user per hour, protecting Open Library rather than us.
 * - q trimmed, 2-100 chars. Shorter -> 200 { results: [] }.
 * - Upstream failures (timeout > 2s, non-200, malformed JSON) return status 200 with { results: [], indisponivel: true }.
 */
export default defineApiHandler(async (event) => {
  const user = await requireSessionUser(event)
  const { q } = parseOrThrow(searchQuerySchema, getQuery(event))

  if (q.length < 2) {
    return { results: [] }
  }

  const underLimit = await checkRateLimit(
    `ol_search:user:${user.id}`,
    EXTERNAL_LOOKUP_LIMIT_PER_HOUR,
  )

  if (!underLimit) {
    throw createError({
      statusCode: 429,
      data: {
        error: 'muitas_tentativas',
        message:
          'Você atingiu o limite de 20 buscas externas por hora. Tente novamente mais tarde.',
      },
    })
  }

  // Enriquecimento pt-BR roda dentro de searchOpenLibrary (sempre).
  return await searchOpenLibrary(q)
})
