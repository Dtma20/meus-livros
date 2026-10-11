import { defineEventHandler, getRequestHeader, getRequestHost, setResponseStatus } from 'h3'

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
    setResponseStatus(event, 403)
    return { error: 'origem_invalida', message: 'Origem da requisição inválida.' }
  }

  let expectedHost: string
  const canonical = process.env.BETTER_AUTH_URL
  if (canonical) {
    try {
      expectedHost = new URL(canonical).host
    }
    catch {
      expectedHost = ''
    }
  }
  else {
    expectedHost = getRequestHost(event)
  }

  if (originHost !== expectedHost) {
    setResponseStatus(event, 403)
    return { error: 'origem_invalida', message: 'Origem da requisição inválida.' }
  }
})
