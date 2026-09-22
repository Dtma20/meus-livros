import { readBody, setResponseStatus } from 'h3'
import { z } from 'zod'
import { checkRateLimit } from '../../services/rate-limit'
import { defineApiHandler, parseOrThrow } from '../../utils/api'
import { sanitizeClientErrorMessage } from '../../utils/client-error'
import { getClientIp } from '../../utils/client-ip'
import { logger } from '../../utils/logger'

const clientErrorSchema = z.object({
  message: z.string().min(1).max(2000),
  name: z.string().max(100).optional(),
  stack: z.string().max(8000).optional(),
  url: z.string().max(1000).optional(),
  requestId: z.string().max(64).optional(),
  component: z.string().max(100).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
})

export default defineApiHandler(async (event) => {
  const ip = getClientIp(event)

  // Protect ingestion endpoint from flooding (max 30 error reports per IP per hour)
  const allowed = await checkRateLimit(`client-errors:ip:${ip}`, 30)
  if (!allowed) {
    setResponseStatus(event, 429)
    return { error: 'muitas_tentativas', message: 'Limite de envio de erros atingido.' }
  }

  const rawBody = await readBody(event)
  const input = parseOrThrow(clientErrorSchema, rawBody)
  const safeMessage = sanitizeClientErrorMessage(input.message)

  logger.error(`[client] Erro capturado no frontend: ${safeMessage}`, {
    module: 'client',
    source: 'client',
    requestId: input.requestId || (event.context?.requestId as string | undefined),
    context: {
      url: input.url,
      component: input.component,
      ...input.context,
    },
    error: {
      name: input.name || 'ClientError',
       message: safeMessage,
      stack: input.stack,
    },
  })

  setResponseStatus(event, 200)
  return { ok: true }
})
