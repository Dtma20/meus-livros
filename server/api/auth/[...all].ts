import { toWebRequest } from 'h3'
import { handleAuthRequest } from '../../services/auth'

/**
 * Catch-all route that delegates every /api/auth/* request to handleAuthRequest.
 * Enforces rate limits on OTP requests, allowlist verification, and error response shapes.
 */
export default defineEventHandler(async (event) => {
  return handleAuthRequest(toWebRequest(event))
})
