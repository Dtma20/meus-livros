import { readBody, setResponseStatus } from 'h3'
import { logInputSchema } from '../../../shared/schemas/log'
import { createLog } from '../../services/logs'
import { defineApiHandler, parseOrThrow } from '../../utils/api'
import { requireSessionUser } from '../../utils/session'

export default defineApiHandler(async (event) => {
  const user = await requireSessionUser(event)
  const input = parseOrThrow(logInputSchema, await readBody(event))

  const result = await createLog(input, user.id)
  setResponseStatus(event, 201)
  return result
})
