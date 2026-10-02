import { createError, getQuery, setResponseHeader } from 'h3'
import { $fetch } from 'ofetch'
import { normalizeLookupIsbn, sanitizeIsbnData, type IsbnLookupResult } from '../../shared/schemas/isbn-lookup'
import { checkRateLimit } from '../services/rate-limit'
import { findIsbnCover } from '../services/isbn-cover'
import { defineApiHandler } from '../utils/api'
import { requireSessionUser } from '../utils/session'

export default defineApiHandler(async (event): Promise<IsbnLookupResult> => {
  const user = await requireSessionUser(event)
  setResponseHeader(event, 'cache-control', 'no-store')
  const isbn = normalizeLookupIsbn(getQuery(event).isbn)
  if (!isbn) throw createError({ statusCode: 400, data: { error: 'isbn_invalido', message: 'Informe um ISBN-10 ou ISBN-13 válido.' } })
  if (!await checkRateLimit(`isbn:user:${user.id}`, 60)) {
    throw createError({ statusCode: 429, data: { error: 'muitas_tentativas', message: 'Muitas consultas. Tente novamente mais tarde.' } })
  }
  const coverController = new AbortController()
  const coverPromise = findIsbnCover(isbn, coverController.signal).catch(() => null)
  try {
    const raw = await $fetch<unknown>(`https://brasilapi.com.br/api/isbn/v1/${isbn}`, { timeout: 8000, retry: 0 })
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid ISBN response')
    const data = sanitizeIsbnData(raw as Record<string, unknown>)
    if (!data.cover_url) {
      const cover = await coverPromise
      if (cover) data.cover_url = cover
    }
    return { status: 'found', data }
  } catch (error: unknown) {
    const status = (error as { statusCode?: number; status?: number } | null)?.statusCode
      ?? (error as { status?: number } | null)?.status
    if (status === 404) return { status: 'not_found' }
    throw createError({ statusCode: 502, data: { error: 'consulta_indisponivel', message: 'Não foi possível consultar agora. Tente novamente ou preencha manualmente.' } })
  } finally {
    coverController.abort()
  }
})
