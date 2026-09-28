import { listMembers } from '../../services/members'
import { defineApiHandler } from '../../utils/api'
import { requireSessionUser } from '../../utils/session'

export default defineApiHandler(async (event) => {
  const sessionUser = await requireSessionUser(event)
  return await listMembers({ id: sessionUser.id })
})
