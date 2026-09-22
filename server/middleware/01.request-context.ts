import { defineEventHandler, getRequestHeader, setResponseHeader } from 'h3'

const REQUEST_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/

export default defineEventHandler((event) => {
  const incomingId =
    getRequestHeader(event, 'x-request-id') ||
    getRequestHeader(event, 'x-correlation-id')

  let requestId: string
  if (incomingId && REQUEST_ID_REGEX.test(incomingId)) {
    requestId = incomingId
  } else {
    requestId = crypto.randomUUID()
  }

  event.context.requestId = requestId
  event.context.startTime = performance.now()

  // Propagate to client in response header
  setResponseHeader(event, 'x-request-id', requestId)
})
