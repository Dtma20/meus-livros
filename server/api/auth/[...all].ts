import { toWebRequest } from 'h3'
import { defineApiHandler } from '../../utils/api'
import { handleAuthRequest } from '../../services/auth'

// defineApiHandler passes the Response through unchanged (status, headers, every set-cookie) and turns a
// throw into the project's 500 { error, message, requestId }, logged through logger.
export default defineApiHandler(async (event) => {
  return handleAuthRequest(toWebRequest(event))
})
