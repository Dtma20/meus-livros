import { toWebRequest } from 'h3'
import { handleAuthRequest } from '../../services/auth'

export default defineEventHandler(async (event) => {
  return handleAuthRequest(toWebRequest(event))
})
