import { getQuery, readBody, setResponseStatus } from 'h3'
import { workInputSchema } from '../../../shared/schemas/work'
import { createWork } from '../../services/catalog'
import { defineApiHandler, parseOrThrow } from '../../utils/api'
import { requireSessionUser } from '../../utils/session'

export default defineApiHandler(async (event) => {
  const user = await requireSessionUser(event)
  const input = parseOrThrow(workInputSchema, await readBody(event))

  const force = String(getQuery(event).forcar ?? '') === '1'

  const work = await createWork(input, user.id, { force })
  setResponseStatus(event, 201)
  return work
})
