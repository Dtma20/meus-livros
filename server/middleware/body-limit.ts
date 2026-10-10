import { defineEventHandler, getRequestHeader, getRequestURL, setResponseStatus, type H3Event } from 'h3'

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const DEFAULT_LIMIT = 64 * 1024
// A 1000-book export goes past 64 KB, so the import route gets its own ceiling.
const IMPORT_LIMIT = 4 * 1024 * 1024
const IMPORT_PATH = '/api/library/import'

function tooLarge(event: H3Event) {
  setResponseStatus(event, 413)
  return { error: 'corpo_muito_grande', message: 'A requisição é grande demais.' }
}

function lengthRequired(event: H3Event) {
  setResponseStatus(event, 411)
  return { error: 'tamanho_obrigatorio', message: 'Informe o tamanho da requisição.' }
}

export default defineEventHandler((event) => {
  if (!BODY_METHODS.has(event.method)) {
    return
  }

  const isImport = event.method === 'POST' && getRequestURL(event).pathname === IMPORT_PATH
  const limit = isImport ? IMPORT_LIMIT : DEFAULT_LIMIT

  const contentLength = getRequestHeader(event, 'content-length')
  if (contentLength === undefined) {
    // Without a length, a chunked body can be any size. Browsers always send content-length for string bodies.
    if (getRequestHeader(event, 'transfer-encoding') !== undefined) {
      return tooLarge(event)
    }
    // HTTP/2 allows a body with neither header, so a write must state its size. DELETE is exempt:
    // browsers send no content-length on a bodiless DELETE.
    if (event.method !== 'DELETE') {
      return lengthRequired(event)
    }
    return
  }

  // Anything that is not a plain integer is treated as oversized rather than trusted.
  if (!/^\d+$/.test(contentLength) || Number(contentLength) > limit) {
    return tooLarge(event)
  }
})
