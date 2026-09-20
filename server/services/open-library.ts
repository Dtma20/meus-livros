import { z } from 'zod'
import { LANGUAGES } from '../../shared/constants/languages'
import type { ExternalBookResult, ExternalSearchResponse } from '../../shared/schemas/search'

export const OPEN_LIBRARY_TIMEOUT_MS = 2000
export const OPEN_LIBRARY_SEARCH_URL = 'https://openlibrary.org/search.json'
export const OPEN_LIBRARY_USER_AGENT =
  'MeusLivros/0.1.0 (https://github.com/Dtma20/meus-livros; contato@meuslivros.app)'

/**
 * Common ISO 639-2 (bibliographic/terminology) codes to ISO 639-1 (two-letter).
 */
const ISO_639_2_TO_1: Record<string, string> = {
  por: 'pt',
  eng: 'en',
  spa: 'es',
  fre: 'fr',
  fra: 'fr',
  ger: 'de',
  deu: 'de',
  ita: 'it',
  rus: 'ru',
  jpn: 'ja',
  chi: 'zh',
  zho: 'zh',
  lat: 'la',
  gre: 'el',
  ell: 'el',
  heb: 'he',
  ara: 'ar',
  nor: 'no',
  dut: 'nl',
  nld: 'nl',
  pol: 'pl',
  swe: 'sv',
  kor: 'ko',
}

const VALID_LANGUAGE_CODES = new Set<string>(LANGUAGES.map((l) => l.code))

/**
 * Normalizes Open Library language codes to ISO 639-1.
 * Handles 3-letter ISO 639-2 codes, 2-letter ISO 639-1 codes, and common variants.
 * Returns null for any code not present in the project's supported LANGUAGES list.
 */
export function normalizeLanguageToIso6391(
  rawLang: string | null | undefined,
): string | null {
  if (!rawLang || typeof rawLang !== 'string') return null
  const cleaned = rawLang.trim().toLowerCase()
  if (!cleaned) return null

  let candidate: string | null = null
  if (cleaned.length === 2 && /^[a-z]{2}$/.test(cleaned)) {
    candidate = cleaned
  } else if (cleaned.length === 3 && ISO_639_2_TO_1[cleaned]) {
    candidate = ISO_639_2_TO_1[cleaned]!
  }

  if (candidate && VALID_LANGUAGE_CODES.has(candidate)) {
    return candidate
  }

  return null
}

/**
 * Zod schema for untrusted Open Library API response.
 */
export const openLibraryDocSchema = z.object({
  key: z.string(),
  title: z.string().optional().default('Sem título'),
  author_name: z.array(z.string()).optional().default([]),
  first_publish_year: z.number().int().optional().nullable(),
  cover_i: z.number().optional().nullable(),
  language: z.array(z.string()).optional().default([]),
})

export const openLibrarySearchResponseSchema = z.object({
  docs: z.array(openLibraryDocSchema).optional().default([]),
  numFound: z.number().optional(),
})

export type OpenLibraryDoc = z.infer<typeof openLibraryDocSchema>
export type OpenLibraryDocInput = z.input<typeof openLibraryDocSchema>

/**
 * Maps an Open Library document to the application's ExternalBookResult.
 *
 * Rules:
 * - key -> ol_work_key (strips leading '/works/')
 * - title -> title
 * - author_name[] -> authors
 * - first_publish_year -> first_publish_year
 * - cover_i -> ol_cover_id and https://covers.openlibrary.org/b/id/{id}-M.jpg
 * - language[0] -> ISO 639-1
 * - Genres are NEVER imported.
 */
export function mapOpenLibraryDoc(rawDoc: OpenLibraryDocInput): ExternalBookResult {
  const doc = openLibraryDocSchema.parse(rawDoc)
  const ol_work_key = doc.key.replace(/^\/works\//, '').trim()
  const title = doc.title.trim()
  const authorNames = (doc.author_name ?? [])
    .map((name) => name.trim())
    .filter(Boolean)

  const first_publish_year =
    typeof doc.first_publish_year === 'number' &&
    Number.isInteger(doc.first_publish_year)
      ? doc.first_publish_year
      : null

  const ol_cover_id =
    typeof doc.cover_i === 'number' &&
    Number.isInteger(doc.cover_i) &&
    doc.cover_i > 0
      ? doc.cover_i
      : null

  const cover_url = ol_cover_id
    ? `https://covers.openlibrary.org/b/id/${ol_cover_id}-M.jpg`
    : null

  const firstLang = doc.language?.[0]
  const language = normalizeLanguageToIso6391(firstLang)

  return {
    ol_work_key,
    title,
    authors: authorNames,
    first_publish_year,
    cover_url,
    ol_cover_id,
    language,
  }
}

export interface SearchOpenLibraryOptions {
  timeoutMs?: number
  fetchFn?: typeof fetch
  userAgent?: string
}

/**
 * Searches Open Library with a strict AbortController timeout.
 *
 * Returns 200 shape `{ results: [...], indisponivel?: boolean }`.
 * On timeout, non-200 status, or malformed JSON, returns `{ results: [], indisponivel: true }`.
 * Never throws an error — upstream degradation must never break our application.
 */
export async function searchOpenLibrary(
  query: string,
  options: SearchOpenLibraryOptions = {},
): Promise<ExternalSearchResponse> {
  const trimmedQuery = query.trim()

  // Not a duplicate of the route's own length check: that one decides whether a
  // rate-limit slot is spent, this one stops a pointless request leaving for a
  // third party. Both are cheap; removing either loses something.
  if (trimmedQuery.length < 2) {
    return { results: [] }
  }

  const timeoutMs = options.timeoutMs ?? OPEN_LIBRARY_TIMEOUT_MS
  const fetchFn = options.fetchFn ?? globalThis.fetch
  const userAgent = options.userAgent ?? OPEN_LIBRARY_USER_AGENT

  const url = `${OPEN_LIBRARY_SEARCH_URL}?q=${encodeURIComponent(
    trimmedQuery,
  )}&limit=5&fields=key,title,author_name,cover_i,first_publish_year,language`

  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  try {
    const response = await fetchFn(url, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      console.error(
        `[open-library] resposta não-200 da Open Library: HTTP ${response.status}`,
      )
      return { results: [], indisponivel: true }
    }

    let json: unknown
    try {
      json = await response.json()
    } catch (err) {
      console.error('[open-library] malformed JSON da Open Library:', err)
      return { results: [], indisponivel: true }
    }

    const parsed = openLibrarySearchResponseSchema.safeParse(json)
    if (!parsed.success) {
      console.error(
        '[open-library] resposta inválida da Open Library (Zod):',
        parsed.error,
      )
      return { results: [], indisponivel: true }
    }

    const results = parsed.data.docs.map(mapOpenLibraryDoc)
    return { results }
  } catch (err: unknown) {
    // Check if error was an abort/timeout
    const isAbort =
      controller.signal.aborted ||
      (err instanceof Error && err.name === 'AbortError')

    if (isAbort) {
      console.error(
        `[open-library] timeout de ${timeoutMs}ms excedido na consulta à Open Library`,
      )
    } else {
      console.error('[open-library] erro inesperado ao consultar Open Library:', err)
    }

    return { results: [], indisponivel: true }
  } finally {
    clearTimeout(timer)
  }
}
