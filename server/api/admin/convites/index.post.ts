import { readBody, setResponseStatus } from 'h3'
import { addInviteSchema } from '../../../../shared/schemas/invites'
import { addInvite } from '../../../services/invites'
import { defineApiHandler, parseOrThrow } from '../../../utils/api'
import { requireAdmin } from '../../../utils/session'

export default defineApiHandler(async (event) => {
  const admin = await requireAdmin(event)
  const input = parseOrThrow(addInviteSchema, await readBody(event))

  const invite = await addInvite(admin.id, input)
  setResponseStatus(event, 201)
  return { invite }
})
