import { readBody, setResponseStatus } from 'h3'
import { deleteInviteSchema } from '../../../../shared/schemas/invites'
import { removeInvite } from '../../../services/invites'
import { defineApiHandler, parseOrThrow } from '../../../utils/api'
import { requireAdmin } from '../../../utils/session'

export default defineApiHandler(async (event) => {
  const admin = await requireAdmin(event)
  const input = parseOrThrow(deleteInviteSchema, await readBody(event))

  await removeInvite(admin.email, input.email)
  setResponseStatus(event, 204)
  return null
})
