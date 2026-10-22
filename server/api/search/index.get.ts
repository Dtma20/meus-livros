import { getQuery } from 'h3'
import { searchQuerySchema } from '../../../shared/schemas/search'
import { checkRateLimit } from '../../services/rate-limit'
import { recordSearchMiss, searchWorks } from '../../services/search'
import { defineApiHandler, parseOrThrow } from '../../utils/api'
import { getClientIp } from '../../utils/client-ip'
import { getSessionUser } from '../../utils/session'

export default defineApiHandler(async (event) => {
  const query = getQuery(event)
  const { q } = parseOrThrow(searchQuerySchema, query)

  if (q.length < 2) {
    return { works: [] }
  }

  const user = await getSessionUser(event)
  const viewer = user ? { id: user.id } : null

  const works = await searchWorks(q, viewer)

  if (works.length === 0) {
    if (viewer) {
      void recordSearchMiss(q, viewer.id)
    } else {
      const ip = getClientIp(event)
      void checkRateLimit(`search_miss:ip:${ip}`, 30)
        .then((allowed) => {
          if (allowed) {
            void recordSearchMiss(q, null)
          }
        })
        .catch(() => {})
    }
  }

  return { works }
})
