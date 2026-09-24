import { z } from 'zod'
import { LANGUAGES } from '../../shared/constants/languages'
import type { ExternalBookResult, ExternalSearchResponse } from '../../shared/schemas/search'
import { logger } from '../utils/logger'
import { withRetry } from '../utils/retry'

export const OPEN_LIBRARY_TIMEOUT_MS = 4000
export const OPEN_LIBRARY_SEARCH_URL = 'https://openlibrary.org/search.json'
export const OPEN_LIBRARY_USER_AGENT =
  'MeusLivros/0.1.0 (https://github.com/Dtma20/meus-livros; contato@meuslivros.app)'
/**
 * Quantos docs pedir ao search.json. Maior que o número devolvido de
 * propósito: a ordenação pt-primeiro precisa de um pool para escolher —
 * com limit=5 uma edição brasileira em 6º lugar nunca apareceria.
 */
export const OPEN_LIBRARY_FETCH_LIMIT = 15
/** Teto de resultados devolvidos após ordenar e enriquecer. */
export const OPEN_LIBRARY_MAX_RESULTS = 10
/** Teto de obras que recebem busca extra por edição em português. */
export const MAX_PT_ENRICH = 3
/**
 * Quantas edições pedir por obra ao procurar a brasileira.
 * 100 porque `limit=50` corta antes das edições PT de obras com muitas
 * traduções (1984: primeira PT na posição ~51–100). OL aceita 100/page.
 */
const PT_EDITIONS_FETCH_LIMIT = 100
const OPEN_LIBRARY_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const OPEN_LIBRARY_CACHE_MAX_ENTRIES = 100
const openLibraryCache = new Map<
  string,
  { expires: number; data: ExternalSearchResponse }
>()

function normalizeCacheQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ')
}

function cacheExternalSearchResponse(
  key: string,
  data: ExternalSearchResponse,
): void {
  openLibraryCache.delete(key)
  while (openLibraryCache.size >= OPEN_LIBRARY_CACHE_MAX_ENTRIES) {
    const oldestKey = openLibraryCache.keys().next().value
    if (oldestKey === undefined) break
    openLibraryCache.delete(oldestKey)
  }
  openLibraryCache.set(key, {
    expires: Date.now() + OPEN_LIBRARY_CACHE_TTL_MS,
    data,
  })
}

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
 * Escolhe o idioma de um doc do search.json com viés pt-BR.
 *
 * O campo `language` da Open Library lista TODAS as edições conhecidas da
 * obra (Harry Potter tem 50+), numa ordem arbitrária — `language[0]` de
 * "Harry Potter e a Pedra Filosofal" é `mar` (marata), não `eng` nem `por`.
 * Por isso: se `por`/`pt` aparece em qualquer posição, o resultado é `pt`;
 * senão, o primeiro código normalizável; senão, null.
 */
export function preferredLanguage(
  codes: string[] | undefined,
): string | null {
  if (!Array.isArray(codes) || codes.length === 0) return null
  let fallback: string | null = null
  for (const code of codes) {
    const normalized = normalizeLanguageToIso6391(code)
    if (normalized === 'pt') return 'pt'
    if (fallback === null && normalized !== null) fallback = normalized
  }
  return fallback
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
  // The median across every edition Open Library knows for the work, not the
  // page count of any one edition. Close enough to prefill the field; the user
  // can correct it.
  number_of_pages_median: z.number().optional().nullable(),
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
 * - language[] -> ISO 639-1, com viés pt-BR (ver preferredLanguage)
 * - number_of_pages_median -> page_count
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

  const language = preferredLanguage(doc.language)

  // Same ceiling the edition form enforces, so a nonsense upstream value is
  // dropped here rather than prefilling a field that will refuse to submit.
  const page_count =
    typeof doc.number_of_pages_median === 'number' &&
    Number.isInteger(doc.number_of_pages_median) &&
    doc.number_of_pages_median > 0 &&
    doc.number_of_pages_median <= 50000
      ? doc.number_of_pages_median
      : null

  return {
    ol_work_key,
    title,
    authors: authorNames,
    first_publish_year,
    cover_url,
    ol_cover_id,
    language,
    page_count,
  }
}


export interface SearchOpenLibraryOptions {
  timeoutMs?: number
  fetchFn?: typeof fetch
  userAgent?: string
  requestId?: string
  maxRetries?: number
}

/**
 * Zod schema para a resposta de `/works/{key}/editions.json`.
 * Só os campos usados no enriquecimento; o resto é ignorado.
 */
const openLibraryEditionSchema = z.object({
  title: z.string().optional(),
  languages: z
    .array(z.object({ key: z.string() }).passthrough())
    .optional()
    .default([]),
  covers: z.array(z.number()).optional().default([]),
  number_of_pages: z.number().optional().nullable(),
})

const openLibraryEditionsResponseSchema = z.object({
  entries: z.array(openLibraryEditionSchema).optional().default([]),
})

/**
 * Troca título/capa/páginas/idioma de um resultado pelo da edição
 * brasileira da obra, quando ela existe.
 *
 * Por que isso existe: o search.json devolve a obra (nível work), cujo
 * título canônico é quase sempre o inglês — "Harry Potter and the
 * Philosopher's Stone" mesmo para quem digitou "Pedra Filosofal". O título
 * em português mora nas edições (`Rocco`, `/languages/por`).
 *
 * Roda em TODO resultado com `language === 'pt'` (híbrido e botão).
 * Best-effort puro: qualquer falha (timeout, 5xx, JSON estranho, sem edição
 * `por`) devolve `base` intocado. Nunca joga erro, nunca marca indisponível.
 */
export async function enrichWithPortugueseEdition(
  base: ExternalBookResult,
  options: {
    fetchFn: typeof fetch
    userAgent: string
    signal: AbortSignal
    requestId?: string
  },
): Promise<ExternalBookResult> {
  if (!base.ol_work_key || options.signal.aborted) return base

  const url =
    `https://openlibrary.org/works/${encodeURIComponent(base.ol_work_key)}` +
    `/editions.json?limit=${PT_EDITIONS_FETCH_LIMIT}` +
    `&fields=key,title,languages,publishers,covers,number_of_pages,isbn`

  try {
    const response = await options.fetchFn(url, {
      method: 'GET',
      headers: {
        'User-Agent': options.userAgent,
        Accept: 'application/json',
      },
      signal: options.signal,
    })
    if (!response.ok) return base

    const parsed = openLibraryEditionsResponseSchema.safeParse(
      await response.json(),
    )
    if (!parsed.success) return base

    const ptEdition = parsed.data.entries.find((entry) =>
      (entry.languages ?? []).some(
        (lang) => String(lang.key ?? '').trim().toLowerCase() === '/languages/por',
      ),
    )
    if (!ptEdition) return base

    const ptTitle = ptEdition.title?.trim()
    const ptCoverId = (ptEdition.covers ?? []).find(
      (cover) => Number.isInteger(cover) && cover > 0,
    )
    const ptPages =
      typeof ptEdition.number_of_pages === 'number' &&
      Number.isInteger(ptEdition.number_of_pages) &&
      ptEdition.number_of_pages > 0 &&
      ptEdition.number_of_pages <= 50000
        ? ptEdition.number_of_pages
        : null

    return {
      ...base,
      title: ptTitle || base.title,
      cover_url:
        ptCoverId !== undefined
          ? `https://covers.openlibrary.org/b/id/${ptCoverId}-M.jpg`
          : base.cover_url,
      ol_cover_id: ptCoverId !== undefined ? ptCoverId : base.ol_cover_id,
      language: 'pt',
      page_count: ptPages ?? base.page_count,
    }
  } catch {
    return base
  }
}

/**
 * Searches Open Library with a strict AbortController timeout and retry for transient failures.
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
  // third party. Open Library **rejects queries shorter than 3 characters with
  // HTTP 422** ("Query too short") — a local search still supports 2 chars, but
  // an external complement for "ha" can only burn latency and log noise.
  if (trimmedQuery.length < 3) {
    return { results: [] }
  }

  const timeoutMs = options.timeoutMs ?? OPEN_LIBRARY_TIMEOUT_MS
  const fetchFn = options.fetchFn ?? globalThis.fetch
  const useCache = options.fetchFn === undefined
  const cacheKey = normalizeCacheQuery(trimmedQuery)
  const userAgent = options.userAgent ?? OPEN_LIBRARY_USER_AGENT
  const requestId = options.requestId
  const maxRetries = options.maxRetries ?? 1

  if (useCache) {
    const cached = openLibraryCache.get(cacheKey)
    if (cached) {
      if (cached.expires > Date.now()) return cached.data
      openLibraryCache.delete(cacheKey)
    }
  }

  const url = `${OPEN_LIBRARY_SEARCH_URL}?q=${encodeURIComponent(
    trimmedQuery,
  )}&limit=${OPEN_LIBRARY_FETCH_LIMIT}&fields=key,title,author_name,cover_i,first_publish_year,language,number_of_pages_median`

  const startTime = performance.now()

  // Orçamento total, não por tentativa: um único AbortController cobre todas
  // as tentativas, então uma Open Library travada custa no máximo timeoutMs
  // ao usuário — nunca timeoutMs por tentativa mais o backoff entre elas.
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  try {
    const result = await withRetry(
      async (attempt) => {
        const attemptStart = performance.now()

        try {
          const response = await fetchFn(url, {
            method: 'GET',
            headers: {
              'User-Agent': userAgent,
              Accept: 'application/json',
            },
            signal: controller.signal,
          })

          const attemptDuration = Math.round(performance.now() - attemptStart)

          if (!response.ok) {
            const status = response.status
            // 5xx errors from Open Library are transient and should trigger retry
            if (status >= 500 && attempt <= maxRetries) {
              const err = new Error(`resposta não-200 da Open Library: HTTP ${status}`)
              ;(err as { statusCode?: number }).statusCode = status
              throw err
            }

            // 422 = Open Library validated OUR query and rejected it (e.g.
            // "Query too short"). The upstream is healthy; an empty list is the
            // correct answer, not `indisponivel` — the UI would tell the user
            // the service is down when it is not. Guard above already prevents
            // the known short-query case; this stays as a safety net if OL
            // changes validation rules again.
            if (status === 422) {
              logger.warn(`[open-library] Open Library rejeitou a consulta (HTTP 422)`, {
                module: 'open-library',
                source: 'external_api',
                requestId,
                durationMs: attemptDuration,
                attempt,
                context: { query: trimmedQuery, status },
              })
              return { results: [] }
            }

            logger.error(`[open-library] resposta não-200 da Open Library: HTTP ${status}`, {
              module: 'open-library',
              source: 'external_api',
              requestId,
              durationMs: attemptDuration,
              attempt,
              http: { path: url, statusCode: status, durationMs: attemptDuration },
              context: { query: trimmedQuery, status },
            })
            return { results: [], indisponivel: true }
          }

          let json: unknown
          try {
            json = await response.json()
          } catch (err) {
            logger.error('[open-library] malformed JSON da Open Library:', {
              module: 'open-library',
              source: 'external_api',
              requestId,
              durationMs: attemptDuration,
              attempt,
              context: { query: trimmedQuery, _rawError: err },
              error: err as Error,
            })
            return { results: [], indisponivel: true }
          }

          const parsed = openLibrarySearchResponseSchema.safeParse(json)
          if (!parsed.success) {
            logger.error('[open-library] resposta inválida da Open Library (Zod):', {
              module: 'open-library',
              source: 'external_api',
              requestId,
              durationMs: attemptDuration,
              attempt,
              context: { query: trimmedQuery },
              error: parsed.error,
            })
            return { results: [], indisponivel: true }
          }

          const mapped = parsed.data.docs.map(mapOpenLibraryDoc)
          // Ordenação estável com viés pt-BR: resultados com edição em
          // português sobem, o resto mantém a ordem de relevância da OL.
          mapped.sort(
            (a, b) => Number(b.language === 'pt') - Number(a.language === 'pt'),
          )
          const top = mapped.slice(0, OPEN_LIBRARY_MAX_RESULTS)

          // Título em português SEMPRE que a obra tiver edição `por`:
          // o search.json devolve o canônico (quase sempre inglês). As
          // requisições correm em paralelo dentro do mesmo AbortController —
          // se o deadline estourar, cada item devolve o título base (melhor
          // esforço), nunca falha a busca. `language === 'pt'` (preferredLanguage)
          // significa que `por` aparece no array da obra → edição PT existe.
          const toEnrich = top.filter((r) => r.language === 'pt')
          const enrichCandidates = toEnrich.slice(0, MAX_PT_ENRICH)
          const unenriched = toEnrich.slice(MAX_PT_ENRICH)
          const rest = top.filter((r) => r.language !== 'pt')
          let enriched: ExternalBookResult[] = []
          if (enrichCandidates.length > 0) {
            enriched = await Promise.all(
              enrichCandidates.map((base) =>
                enrichWithPortugueseEdition(base, {
                  fetchFn,
                  userAgent,
                  signal: controller.signal,
                  requestId,
                }),
              ),
            )
          }
          // Reordena: enriquecidos (título PT confirmado) mantêm prioridade.
          const results = [...enriched, ...unenriched, ...rest]
          const totalDuration = Math.round(performance.now() - startTime)

          logger.info(`[open-library] Busca concluída com ${results.length} resultados`, {
            module: 'open-library',
            source: 'external_api',
            requestId,
            durationMs: totalDuration,
            attempt,
            context: { query: trimmedQuery, resultsCount: results.length },
          })

          return { results }
        } catch (err: unknown) {
          const isAbort =
            controller.signal.aborted ||
            (err instanceof Error && err.name === 'AbortError')

          // O deadline é compartilhado entre as tentativas: se ele estourou,
          // tentar de novo abortaria na hora. Não há o que repetir.
          if (isAbort) {
            const attemptDuration = Math.round(performance.now() - attemptStart)
            logger.error(`[open-library] timeout de ${timeoutMs}ms excedido na consulta à Open Library`, {
              module: 'open-library',
              source: 'external_api',
              requestId,
              durationMs: attemptDuration,
              attempt,
              context: { query: trimmedQuery, timeoutMs },
              error: err as Error,
            })
            return { results: [], indisponivel: true }
          }

          // Erro 5xx com tentativas restantes: relança para o withRetry,
          // ainda dentro do mesmo deadline.
          if (err instanceof Error && 'statusCode' in err && attempt <= maxRetries) {
            throw err
          }

          const attemptDuration = Math.round(performance.now() - attemptStart)
          logger.error('[open-library] erro inesperado ao consultar Open Library:', {
            module: 'open-library',
            source: 'external_api',
            requestId,
            durationMs: attemptDuration,
            attempt,
            context: { query: trimmedQuery, _rawError: err },
            error: err as Error,
          })

          return { results: [], indisponivel: true }
        }
      },
      {
        maxRetries,
        initialDelayMs: 250,
        operationName: 'open_library_search',
        module: 'open-library',
        requestId,
      },
    )

    if (useCache && result.indisponivel !== true) {
      cacheExternalSearchResponse(cacheKey, result)
    }

    return result
  } catch (finalErr: unknown) {
    const totalDuration = Math.round(performance.now() - startTime)
    const isAbort = finalErr instanceof Error && finalErr.name === 'AbortError'

    if (isAbort) {
      logger.error(`[open-library] timeout de ${timeoutMs}ms excedido na consulta à Open Library`, {
        module: 'open-library',
        source: 'external_api',
        requestId,
        durationMs: totalDuration,
        context: { query: trimmedQuery, timeoutMs },
        error: finalErr as Error,
      })
    } else {
      const message = finalErr instanceof Error ? finalErr.message : String(finalErr)
      logger.error(`[open-library] ${message}`, {
        module: 'open-library',
        source: 'external_api',
        requestId,
        durationMs: totalDuration,
        context: { query: trimmedQuery },
        error: finalErr as Error,
      })
    }

    return { results: [], indisponivel: true }
  } finally {
    clearTimeout(timer)
  }
}
