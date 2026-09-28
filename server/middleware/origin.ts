import { createError, defineEventHandler, getRequestHeader, getRequestHost } from 'h3'

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export default defineEventHandler((event) => {
  if (!MUTATING.has(event.method)) {
    return
  }

  const origin = getRequestHeader(event, 'origin')
  if (!origin) {
    return
  }

  let originHost: string
  try {
    originHost = new URL(origin).host
  }
  catch {
    throw createError({
      statusCode: 403,
      data: { error: 'origem_invalida', message: 'Origem da requisição inválida.' },
    })
  }

  const allowed = new Set<string>([getRequestHost(event)])
  const canonical = process.env.BETTER_AUTH_URL
  if (canonical) {
    try {
      allowed.add(new URL(canonical).host)
    }
    catch {
    }
  }

  if (!allowed.has(originHost)) {
    throw createError({
      statusCode: 403,
      data: { error: 'origem_invalida', message: 'Origem da requisição inválida.' },
    })
  }
})
