import type { DashboardResponse } from '../../../shared/schemas/dashboard'
import { getDashboardData } from '../../services/dashboard'
import { defineApiHandler } from '../../utils/api'
import { requireSessionUser } from '../../utils/session'

export default defineApiHandler(async (event): Promise<DashboardResponse> => {
  const user = await requireSessionUser(event)
  return await getDashboardData(user.id)
})
