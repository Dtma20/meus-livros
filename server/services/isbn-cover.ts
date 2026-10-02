import { $fetch } from 'ofetch'
import { normalizeLookupIsbn } from '../../shared/schemas/isbn-lookup'
import { coverUrlSchema } from '../../shared/schemas/work'

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function brasilCover(value: unknown, isbn: string): string | null {
  const data = record(value)
  if (!data || normalizeLookupIsbn(data.isbn) !== isbn) return null
  const cover = coverUrlSchema.safeParse(data.cover_url)
  return cover.success ? cover.data : null
}

function openLibraryCover(value: unknown, isbn: string): string | null {
  const data = record(value)
  if (!data) return null
  const identifiers = [data.isbn_10, data.isbn_13].flatMap(values => Array.isArray(values) ? values : [])
  if (!identifiers.some(value => normalizeLookupIsbn(value) === isbn) || !Array.isArray(data.covers)) return null
  const id = data.covers.find(value => typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
  return id ? `https://covers.openlibrary.org/b/id/${id}-L.jpg?default=false` : null
}

// Start alongside metadata, never add a sequential timeout to BrasilAPI's 8 seconds.
// Only ISBN-matched covers are used; optional provider errors cannot fail the book lookup.
export async function findIsbnCover(isbn: string, signal: AbortSignal): Promise<string | null> {
  if (signal.aborted) return null
  const controller = new AbortController()
  let stop!: () => void
  const deadline = new Promise<null>(resolve => {
    stop = () => { controller.abort(); resolve(null) }
  })
  const timer = setTimeout(stop, 2500)
  signal.addEventListener('abort', stop, { once: true })
  const options = { timeout: 2500, retry: 0, signal: controller.signal }
  const candidates = [
    ...['google-books', 'mercado-editorial'].map(async provider => {
      const data = await $fetch<unknown>(`https://brasilapi.com.br/api/isbn/v1/${isbn}`, { ...options, query: { providers: provider } })
      return brasilCover(data, isbn)
    }),
    $fetch<unknown>(`https://openlibrary.org/isbn/${isbn}.json`, options).then(data => openLibraryCover(data, isbn)),
  ]
  try {
    const firstCover = Promise.any(candidates.map(async candidate => {
      const cover = await candidate
      if (!cover) throw new Error('No matching cover')
      return cover
    })).catch(() => null)
    return await Promise.race([firstCover, deadline])
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', stop)
    controller.abort()
  }
}
