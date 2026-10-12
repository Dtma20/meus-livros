import { defineEventHandler, getRequestHeader, getRequestHost, setResponseStatus } from 'h3'
import { getAppOrigins } from '../utils/app-origin'

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

  const configuredOrigins = getAppOrigins()
  const expectedHosts = configuredOrigins.length
    ? configuredOrigins.map((canonical) => {
        try {
          return new URL(canonical).host
        }
        catch {
          return ''
        }
      })
    : [getRequestHost(event)]

  if (!expectedHosts.includes(originHost)) {
    setResponseStatus(event, 403)
    return { error: 'origem_invalida', message: 'Origem da requisição inválida.' }
  }
})
