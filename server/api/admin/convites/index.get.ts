import { listInvites } from '../../../services/invites'
import { defineApiHandler } from '../../../utils/api'
import { requireAdmin } from '../../../utils/session'

export default defineApiHandler(async (event) => {
  await requireAdmin(event)
  const invites = await listInvites()
  return { invites }
})
