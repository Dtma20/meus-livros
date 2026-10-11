import { defineEventHandler, getRequestHeader, getRequestURL, setResponseStatus, type H3Event } from 'h3'

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const DEFAULT_LIMIT = 64 * 1024
// A 1000-book export goes past 64 KB, so the import route gets its own ceiling.
const IMPORT_LIMIT = 4 * 1024 * 1024
const IMPORT_PATH = '/api/library/import'
const DELETE_WITH_BODY_PATHS = new Set(['/api/admin/convites'])

function tooLarge(event: H3Event) {
  setResponseStatus(event, 413)
  return { error: 'corpo_muito_grande', message: 'A requisição é grande demais.' }
}

function lengthRequired(event: H3Event) {
  setResponseStatus(event, 411)
  return { error: 'tamanho_obrigatorio', message: 'Informe o tamanho da requisição.' }
}

function normalizePathname(pathname: string): string {
  const lower = pathname.toLowerCase()
  const trimmed = lower.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

function bufferFromBody(body: unknown): Buffer | null {
  if (Buffer.isBuffer(body)) return body
  if (typeof body === 'string') return Buffer.from(body)
  if (body instanceof ArrayBuffer) return Buffer.from(body)
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength)
  }
  if (body instanceof URLSearchParams) return Buffer.from(body.toString())
  if (body && typeof body === 'object' && body.constructor === Object) {
    const serialized = JSON.stringify(body)
    return serialized === undefined ? null : Buffer.from(serialized)
  }
  return null
}

function isWebReadableStream(body: unknown): body is ReadableStream<Uint8Array> {
  return typeof body === 'object' && body !== null &&
    'getReader' in body && typeof body.getReader === 'function'
}

async function captureWebBody(
  event: H3Event,
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<boolean> {
  const reader = stream.getReader()
  const chunks: Buffer[] = []
  let size = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = Buffer.from(value)
      size += chunk.byteLength
      if (size > limit) {
        await reader.cancel()
        return true
      }
      chunks.push(chunk)
    }
  }
  finally {
    reader.releaseLock()
  }

  event._requestBody = Buffer.concat(chunks, size)
  return false
}

function captureNodeBody(event: H3Event, limit: number): Promise<boolean> {
  const request = event.node.req

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0

    function cleanup(): void {
      request.removeListener('data', onData)
      request.removeListener('end', onEnd)
      request.removeListener('error', onError)
      request.removeListener('aborted', onAborted)
    }

    function onData(chunk: Buffer): void {
      size += chunk.byteLength
      if (size > limit) {
        request.pause()
        cleanup()
        resolve(true)
        return
      }
      chunks.push(chunk)
    }

    function onEnd(): void {
      cleanup()
      event._requestBody = Buffer.concat(chunks, size)
      resolve(false)
    }

    function onError(error: Error): void {
      cleanup()
      reject(error)
    }

    function onAborted(): void {
      cleanup()
      reject(new Error('Requisição interrompida.'))
    }

    request.on('data', onData)
    request.once('end', onEnd)
    request.once('error', onError)
    request.once('aborted', onAborted)
  })
}

async function captureRequestBody(event: H3Event, limit: number): Promise<boolean> {
  const request = event.node.req as typeof event.node.req & { rawBody?: unknown; body?: unknown }
  const existingBody = event._requestBody ?? request.rawBody ?? request.body

  if (existingBody !== undefined && existingBody !== null) {
    if (isWebReadableStream(existingBody)) {
      return captureWebBody(event, existingBody, limit)
    }
    const body = bufferFromBody(existingBody)
    if (!body) return true
    if (body.byteLength > limit) return true
    event._requestBody = new Uint8Array(body)
    return false
  }

  const webBody = event.web?.request?.body
  if (webBody) return captureWebBody(event, webBody, limit)

  return captureNodeBody(event, limit)
}

export default defineEventHandler(async (event) => {
  if (!BODY_METHODS.has(event.method)) {
    return
  }

  const url = getRequestURL(event)
  const pathname = normalizePathname(url.pathname)
  const isImport = event.method === 'POST' && pathname === IMPORT_PATH
  const limit = isImport ? IMPORT_LIMIT : DEFAULT_LIMIT

  const contentLength = getRequestHeader(event, 'content-length')
  if (contentLength === undefined) {
    // Without a length, a chunked body can be any size. Browsers always send content-length for string bodies.
    if (getRequestHeader(event, 'transfer-encoding') !== undefined) {
      return tooLarge(event)
    }
    // HTTP/2 allows a body with neither header, so a write must state its size. DELETE is exempt:
    // browsers send no content-length on a bodiless DELETE, except for endpoints known to accept a body.
    const isDeleteWithBody = event.method === 'DELETE' && DELETE_WITH_BODY_PATHS.has(pathname)
    if (event.method !== 'DELETE' || isDeleteWithBody) {
      return lengthRequired(event)
    }
    return
  }

  // Anything that is not a plain integer is treated as oversized rather than trusted.
  if (!/^\d+$/.test(contentLength) || Number(contentLength) > limit) {
    return tooLarge(event)
  }

  if (await captureRequestBody(event, limit)) {
    return tooLarge(event)
  }
})
