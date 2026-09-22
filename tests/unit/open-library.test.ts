import { describe, expect, it, vi } from 'vitest'
import {
  enrichWithPortugueseEdition,
  mapOpenLibraryDoc,
  normalizeLanguageToIso6391,
  OPEN_LIBRARY_USER_AGENT,
  preferredLanguage,
  searchOpenLibrary,
} from '../../server/services/open-library'

describe('Open Library service unit tests', () => {
  describe('normalizeLanguageToIso6391', () => {
    it('maps 3-letter ISO 639-2 codes to ISO 639-1', () => {
      expect(normalizeLanguageToIso6391('por')).toBe('pt')
      expect(normalizeLanguageToIso6391('eng')).toBe('en')
      expect(normalizeLanguageToIso6391('spa')).toBe('es')
      expect(normalizeLanguageToIso6391('fre')).toBe('fr')
      expect(normalizeLanguageToIso6391('fra')).toBe('fr')
      expect(normalizeLanguageToIso6391('ger')).toBe('de')
      expect(normalizeLanguageToIso6391('deu')).toBe('de')
      expect(normalizeLanguageToIso6391('ita')).toBe('it')
      expect(normalizeLanguageToIso6391('lat')).toBe('la')
      expect(normalizeLanguageToIso6391('rus')).toBe('ru')
      expect(normalizeLanguageToIso6391('jpn')).toBe('ja')
    })

    it('preserves valid 2-letter ISO 639-1 codes', () => {
      expect(normalizeLanguageToIso6391('pt')).toBe('pt')
      expect(normalizeLanguageToIso6391('en')).toBe('en')
      expect(normalizeLanguageToIso6391('es')).toBe('es')
    })

    it('handles uppercase and leading/trailing whitespace', () => {
      expect(normalizeLanguageToIso6391(' POR ')).toBe('pt')
      expect(normalizeLanguageToIso6391('EN')).toBe('en')
    })

    it('returns null for unknown, empty, or invalid language codes', () => {
      expect(normalizeLanguageToIso6391(null)).toBeNull()
      expect(normalizeLanguageToIso6391(undefined)).toBeNull()
      expect(normalizeLanguageToIso6391('')).toBeNull()
      expect(normalizeLanguageToIso6391('xyz123')).toBeNull()
      expect(normalizeLanguageToIso6391('cs')).toBeNull()
      expect(normalizeLanguageToIso6391('tr')).toBeNull()
    })
  })

  describe('preferredLanguage', () => {
    it('returns pt when por appears anywhere in the array', () => {
      // Caso real: language[0] de Harry Potter é `mar`, com `por` enterrado
      expect(preferredLanguage(['mar', 'afr', 'eng', 'por'])).toBe('pt')
      expect(preferredLanguage(['por', 'eng'])).toBe('pt')
      expect(preferredLanguage(['eng', 'pt'])).toBe('pt')
    })

    it('falls back to the first normalizable code when there is no por', () => {
      expect(preferredLanguage(['eng', 'spa'])).toBe('en')
      expect(preferredLanguage(['mar', 'eng'])).toBe('en')
    })

    it('returns null for empty, missing, or unknown-only arrays', () => {
      expect(preferredLanguage([])).toBeNull()
      expect(preferredLanguage(undefined)).toBeNull()
      expect(preferredLanguage(['xyz123'])).toBeNull()
    })
  })

  describe('mapOpenLibraryDoc', () => {
    it('produces ol_cover_id from cover_i and constructs /b/id/ cover URL', () => {
      const doc = {
        key: '/works/OL45883W',
        title: 'Dom Casmurro',
        author_name: ['Machado de Assis'],
        cover_i: 8225261,
        first_publish_year: 1899,
        language: ['por'],
      }

      const mapped = mapOpenLibraryDoc(doc)

      expect(mapped.ol_cover_id).toBe(8225261)
      expect(mapped.cover_url).toBe(
        'https://covers.openlibrary.org/b/id/8225261-M.jpg',
      )
      expect(mapped.ol_work_key).toBe('OL45883W')
      expect(mapped.title).toBe('Dom Casmurro')
      expect(mapped.authors).toEqual(['Machado de Assis'])
      expect(mapped.first_publish_year).toBe(1899)
      expect(mapped.language).toBe('pt')
    })

    it('handles missing cover_i by setting ol_cover_id and cover_url to null', () => {
      const doc = {
        key: 'OL9999W',
        title: 'Livro Sem Capa',
      }

      const mapped = mapOpenLibraryDoc(doc)

      expect(mapped.ol_cover_id).toBeNull()
      expect(mapped.cover_url).toBeNull()
      expect(mapped.ol_work_key).toBe('OL9999W')
    })

    it('detects pt even when por is not the first language listed', () => {
      const mapped = mapOpenLibraryDoc({
        key: '/works/OL82563W',
        title: "Harry Potter and the Philosopher's Stone",
        author_name: ['J. K. Rowling'],
        language: ['mar', 'afr', 'eng', 'por'],
      })

      expect(mapped.language).toBe('pt')
    })

    it('never imports genres from Open Library response', () => {
      const doc = {
        key: '/works/OL123W',
        title: 'Qualquer Livro',
        // In case extra fields are present
        subjects: ['Fiction', 'Adventure', '19th Century'],
      }

      const mapped = mapOpenLibraryDoc(doc)
      expect((mapped as Record<string, unknown>).genres).toBeUndefined()
      expect((mapped as Record<string, unknown>).subjects).toBeUndefined()
    })
  })

  describe('searchOpenLibrary', () => {
    it('returns empty results immediately for queries shorter than 3 characters', async () => {
      const fetchFn = vi.fn()
      // 2 chars passam na rota local, mas a Open Library rejeita com HTTP 422
      // ("Query too short") — o guard evita a chamada inútil.
      const res = await searchOpenLibrary('ha', { fetchFn, maxRetries: 0 })

      expect(res).toEqual({ results: [] })
      expect(fetchFn).not.toHaveBeenCalled()
    })

    it('returns empty results (not indisponivel) when OL answers 422', async () => {
      const fetchFn = vi.fn(async () => {
        return new Response(
          JSON.stringify({ detail: 'Query too short' }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        )
      }) as unknown as typeof fetch

      const res = await searchOpenLibrary('abc', { fetchFn, maxRetries: 0 })

      // 422 = consulta rejeitada pela validação da OL, upstream saudável.
      expect(res).toEqual({ results: [] })
      expect(res.indisponivel).toBeUndefined()
    })

    it('sends descriptive User-Agent identifying the project', async () => {
      let capturedHeaders: HeadersInit | undefined
      const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
        capturedHeaders = init?.headers
        return new Response(
          JSON.stringify({
            numFound: 1,
            docs: [
              {
                key: '/works/OL45883W',
                title: 'Dom Casmurro',
                author_name: ['Machado de Assis'],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }) as unknown as typeof fetch

      await searchOpenLibrary('Machado de Assis', { fetchFn, maxRetries: 0 })

      expect(fetchFn).toHaveBeenCalledTimes(1)
      const headers = capturedHeaders as Record<string, string>
      expect(headers['User-Agent']).toBe(OPEN_LIBRARY_USER_AGENT)
      expect(headers['User-Agent']).toContain('MeusLivros')
      expect(headers['User-Agent']).toContain('contato@meuslivros.app')
    })

    it('maps a normal 200 response correctly to ExternalBookResult items', async () => {
      const fetchFn = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            numFound: 1,
            docs: [
              {
                key: '/works/OL100W',
                title: 'O Alienista',
                author_name: ['Machado de Assis'],
                cover_i: 123456,
                first_publish_year: 1882,
                language: ['por'],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }) as unknown as typeof fetch

      const res = await searchOpenLibrary('Alienista', { fetchFn, maxRetries: 0 })

      expect(res.indisponivel).toBeUndefined()
      expect(res.results).toHaveLength(1)
      expect(res.results[0]).toEqual({
        ol_work_key: 'OL100W',
        title: 'O Alienista',
        authors: ['Machado de Assis'],
        cover_url: 'https://covers.openlibrary.org/b/id/123456-M.jpg',
        ol_cover_id: 123456,
        first_publish_year: 1882,
        language: 'pt',
        page_count: null,
      })
    })

    it('returns { results: [] } without indisponivel when OL returns 0 results', async () => {
      const fetchFn = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            numFound: 0,
            docs: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }) as unknown as typeof fetch

      const res = await searchOpenLibrary('Histórias da meia-noite Machado', {
        fetchFn,
        maxRetries: 0,
      })

      expect(res.results).toEqual([])
      expect(res.indisponivel).toBeUndefined()
    })

    it('returns { results: [], indisponivel: true } on 500 status from Open Library', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const fetchFn = vi.fn(async () => {
        return new Response('Internal Server Error', { status: 500 })
      }) as unknown as typeof fetch

      const res = await searchOpenLibrary('Dom Casmurro', { fetchFn, maxRetries: 0 })

      expect(res).toEqual({ results: [], indisponivel: true })
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('resposta não-200 da Open Library: HTTP 500'),
      )
      consoleSpy.mockRestore()
    })

    it('returns { results: [], indisponivel: true } on malformed JSON and logs', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const fetchFn = vi.fn(async () => {
        return new Response('<html><body>Gateway Timeout</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })
      }) as unknown as typeof fetch

      const res = await searchOpenLibrary('Dom Casmurro', { fetchFn, maxRetries: 0 })

      expect(res).toEqual({ results: [], indisponivel: true })
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('malformed JSON da Open Library'),
        expect.anything(),
      )
      consoleSpy.mockRestore()
    })

    it('returns { results: [], indisponivel: true } when upstream times out (AbortController)', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      // Mock a fetch that triggers AbortError when signal is aborted
      const fetchFn = vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const err = new Error('The operation was aborted')
              err.name = 'AbortError'
              reject(err)
            })
          }),
      ) as unknown as typeof fetch

      // Use a short 20ms timeout for test execution speed
      const res = await searchOpenLibrary('Slow Query', {
        fetchFn,
        timeoutMs: 20,
        maxRetries: 0,
      })

      expect(res).toEqual({ results: [], indisponivel: true })
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('timeout de 20ms excedido'),
      )
      consoleSpy.mockRestore()
    })

    it('sorts results with a pt edition above non-pt, keeping relevance order', async () => {
      const fetchFn = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            numFound: 3,
            docs: [
              {
                key: '/works/OL1W',
                title: 'The English Original',
                author_name: ['Someone'],
                language: ['eng'],
              },
              {
                key: '/works/OL2W',
                title: 'A Portuguesa',
                author_name: ['Alguém'],
                language: ['por'],
              },
              {
                key: '/works/OL3W',
                title: 'Outro Original em Inglês',
                author_name: ['Another'],
                language: ['eng'],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }) as unknown as typeof fetch

      const res = await searchOpenLibrary('qualquer', { fetchFn, maxRetries: 0 })

      expect(res.results.map((r) => r.ol_work_key)).toEqual([
        'OL2W', // pt, primeira entre as pt
        'OL1W', // relevância original
        'OL3W',
      ])
    })

    it('replaces English canonical title with PT edition title on every path', async () => {
      // search.json devolve obra canônica em inglês; enrich busca /editions.json
      // e troca pelo título da edição /languages/por. Caminho híbrido e botão
      // usam a mesma searchOpenLibrary — sempre enriquece quando language=pt.
      const fetchFn = vi.fn(async (url: string) => {
        if (String(url).includes('/editions.json')) {
          return new Response(
            JSON.stringify({
              entries: [
                {
                  title: 'Harry Potter e a Pedra Filosofal',
                  languages: [{ key: '/languages/por' }],
                  covers: [999],
                  number_of_pages: 224,
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(
          JSON.stringify({
            numFound: 1,
            docs: [
              {
                key: '/works/OL82563W',
                title: "Harry Potter and the Philosopher's Stone",
                author_name: ['J. K. Rowling'],
                language: ['eng', 'por'],
                cover_i: 111,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }) as unknown as typeof fetch

      const res = await searchOpenLibrary('harry potter', { fetchFn, maxRetries: 0 })

      expect(res.results).toHaveLength(1)
      expect(res.results[0]!.title).toBe('Harry Potter e a Pedra Filosofal')
      expect(res.results[0]!.language).toBe('pt')
      expect(res.results[0]!.cover_url).toBe(
        'https://covers.openlibrary.org/b/id/999-M.jpg',
      )
      expect(res.results[0]!.page_count).toBe(224)
      // 1 busca + 1 editions
      expect(fetchFn).toHaveBeenCalledTimes(2)
    })
  })

  describe('enrichWithPortugueseEdition', () => {
    const base = {
      ol_work_key: 'OL82563W',
      title: "Harry Potter and the Philosopher's Stone",
      authors: ['J. K. Rowling'],
      first_publish_year: 1997,
      cover_url: 'https://covers.openlibrary.org/b/id/111-M.jpg',
      ol_cover_id: 111,
      language: 'en',
      page_count: 302,
    }

    it('replaces title, cover, pages and language with the pt edition when one exists', async () => {
      const fetchMock = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            entries: [
              { title: 'English', languages: [{ key: '/languages/eng' }] },
              {
                title: 'Harry Potter e a Pedra Filosofal',
                languages: [{ key: '/languages/por' }],
                covers: [222],
                number_of_pages: 224,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      })
      const fetchFn = fetchMock as unknown as typeof fetch

      const out = await enrichWithPortugueseEdition(base, {
        fetchFn,
        userAgent: 'ua',
        signal: new AbortController().signal,
      })

      expect(out.title).toBe('Harry Potter e a Pedra Filosofal')
      expect(out.cover_url).toBe('https://covers.openlibrary.org/b/id/222-M.jpg')
      expect(out.ol_cover_id).toBe(222)
      expect(out.page_count).toBe(224)
      expect(out.language).toBe('pt')
      expect(out.ol_work_key).toBe('OL82563W')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(String((fetchMock.mock.calls as unknown[][])[0]?.[0])).toContain(
        '/works/OL82563W/editions.json',
      )
    })

    it('returns base untouched when no pt edition exists', async () => {
      const fetchFn = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            entries: [
              { title: 'English', languages: [{ key: '/languages/eng' }] },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }) as unknown as typeof fetch

      const out = await enrichWithPortugueseEdition(base, {
        fetchFn,
        userAgent: 'ua',
        signal: new AbortController().signal,
      })

      expect(out).toEqual(base)
    })

    it('returns base untouched on upstream failure (best-effort, never throws)', async () => {
      const fetchFn = vi.fn(async () => {
        return new Response('boom', { status: 500 })
      }) as unknown as typeof fetch

      const out = await enrichWithPortugueseEdition(base, {
        fetchFn,
        userAgent: 'ua',
        signal: new AbortController().signal,
      })

      expect(out).toEqual(base)
    })

    it('does not fetch when the shared signal is already aborted', async () => {
      const fetchMock = vi.fn()
      const fetchFn = fetchMock as unknown as typeof fetch
      const controller = new AbortController()
      controller.abort()

      const out = await enrichWithPortugueseEdition(base, {
        fetchFn,
        userAgent: 'ua',
        signal: controller.signal,
      })

      expect(out).toEqual(base)
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})
