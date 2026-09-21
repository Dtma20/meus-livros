import { describe, expect, it } from 'vitest'
import {
  buildOgDescription,
  buildOgImageUrl,
  buildOgTitle,
  formatBookFormat,
  formatRatingStars,
  formatReadingDate,
  isValidCoverUrl,
  makeAbsoluteUrl,
  resolveEntryOgImageUrl,
} from '../../app/utils/entry'
import type { LogWithDetails } from '../../shared/schemas/log'

// ---------------------------------------------------------------------------
// formatRatingStars
// ---------------------------------------------------------------------------
describe('formatRatingStars', () => {
  it('returns empty string for null, undefined or 0', () => {
    expect(formatRatingStars(null)).toBe('')
    expect(formatRatingStars(undefined)).toBe('')
    expect(formatRatingStars(0)).toBe('')
  })

  it('formats whole-star rating', () => {
    expect(formatRatingStars(3)).toBe('★★★')
    expect(formatRatingStars(5)).toBe('★★★★★')
  })

  it('formats half-star rating', () => {
    expect(formatRatingStars(4.5)).toBe('★★★★½')
    expect(formatRatingStars(0.5)).toBe('½')
  })
})

// ---------------------------------------------------------------------------
// buildOgTitle
// ---------------------------------------------------------------------------
describe('buildOgTitle', () => {
  it('includes stars when rating is present', () => {
    expect(buildOgTitle('Dom Casmurro', 'diogo', 5)).toBe(
      'Dom Casmurro — ★★★★★ por @diogo',
    )
  })

  it('omits stars when rating is null', () => {
    expect(buildOgTitle('Dom Casmurro', 'diogo', null)).toBe(
      'Dom Casmurro por @diogo',
    )
  })

  it('omits stars when rating is 0', () => {
    expect(buildOgTitle('Dom Casmurro', 'diogo', 0)).toBe(
      'Dom Casmurro por @diogo',
    )
  })
})

// ---------------------------------------------------------------------------
// buildOgDescription
// ---------------------------------------------------------------------------
describe('buildOgDescription', () => {
  it('returns first 160 chars of review', () => {
    const long = 'A'.repeat(200)
    expect(buildOgDescription(long, 'Diogo', 'Livro X')).toBe('A'.repeat(160))
  })

  it('returns trimmed review when under 160 chars', () => {
    expect(buildOgDescription('Ótimo livro!', 'Diogo', 'Livro X')).toBe(
      'Ótimo livro!',
    )
  })

  it('falls back to "{display_name} leu {title}" when review is null', () => {
    expect(buildOgDescription(null, 'Diogo', 'Dom Casmurro')).toBe(
      'Diogo leu Dom Casmurro',
    )
  })

  it('falls back when review is only whitespace', () => {
    expect(buildOgDescription('   ', 'Diogo', 'Livro Y')).toBe(
      'Diogo leu Livro Y',
    )
  })

  // Critical security requirement: og:description from user review must not
  // inject HTML into meta tags. The value here is the raw text used as the
  // `content` attribute value — the framework (Nuxt/useSeoMeta) HTML-escapes
  // attribute values. We verify the function itself does not alter the string,
  // which means the framework will handle escaping correctly.
  it('preserves double-quote and angle-bracket characters in the raw string', () => {
    const review = 'She said "Wow!" and <3 the book'
    const result = buildOgDescription(review, 'X', 'Y')
    expect(result).toBe(review)
  })
})

// ---------------------------------------------------------------------------
// isValidCoverUrl
// ---------------------------------------------------------------------------
describe('isValidCoverUrl', () => {
  it('accepts https URLs', () => {
    expect(isValidCoverUrl('https://covers.example.com/img.jpg')).toBe(true)
  })

  // Was `accepts http URLs`, asserting true. security.md §4 states one rule
  // for cover URLs — "must parse as a URL with an `https:` scheme" — and the
  // write path has always enforced it, so no stored value can be `http:`
  // anyway: all 47 covers in the real corpus are https. The assertion was
  // encoding a third, laxer rule for the Open Graph image path, where an
  // `http:` image on an https page is mixed content.
  it('rejects http URLs', () => {
    expect(isValidCoverUrl('http://covers.example.com/img.jpg')).toBe(false)
  })

  it('rejects empty, null, or non-string', () => {
    expect(isValidCoverUrl(null)).toBe(false)
    expect(isValidCoverUrl('')).toBe(false)
    expect(isValidCoverUrl(undefined)).toBe(false)
  })

  it('rejects data: URLs', () => {
    expect(isValidCoverUrl('data:image/png;base64,ABC')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// makeAbsoluteUrl
// ---------------------------------------------------------------------------
describe('makeAbsoluteUrl', () => {
  it('returns path + origin when path is relative', () => {
    expect(makeAbsoluteUrl('/og-fallback.png', 'https://meus-livros.app')).toBe(
      'https://meus-livros.app/og-fallback.png',
    )
  })

  it('returns absolute URL unchanged', () => {
    const url = 'https://covers.openlibrary.org/b/id/123-L.jpg'
    expect(makeAbsoluteUrl(url, 'https://meus-livros.app')).toBe(url)
  })

  it('strips trailing slash from origin', () => {
    expect(makeAbsoluteUrl('/img.png', 'https://meus-livros.app/')).toBe(
      'https://meus-livros.app/img.png',
    )
  })
})

// ---------------------------------------------------------------------------
// buildOgImageUrl — critical: never produce ?default=false
// ---------------------------------------------------------------------------
describe('buildOgImageUrl - NEVER produce ?default=false', () => {
  const origin = 'https://meus-livros.app'

  it('uses edition cover_url when present and valid', () => {
    const url = buildOgImageUrl({
      editionCoverUrl: 'https://covers.example.com/edition.jpg',
      workCoverUrl: null,
      olCoverId: null,
      origin,
    })
    expect(url).toBe('https://covers.example.com/edition.jpg')
    expect(url).not.toContain('default=false')
  })

  it('falls back to work cover_url when edition cover is absent', () => {
    const url = buildOgImageUrl({
      editionCoverUrl: null,
      workCoverUrl: 'https://covers.example.com/work.jpg',
      olCoverId: null,
      origin,
    })
    expect(url).toBe('https://covers.example.com/work.jpg')
    expect(url).not.toContain('default=false')
  })

  it('uses Open Library cover ID when no cover URL is available', () => {
    const url = buildOgImageUrl({
      editionCoverUrl: null,
      workCoverUrl: null,
      olCoverId: 14620787,
      origin,
    })
    expect(url).toBe('https://covers.openlibrary.org/b/id/14620787-L.jpg')
    expect(url).not.toContain('default=false')
  })

  it('serves /og-fallback.png (absolute) when no cover info is present — NEVER ?default=false', () => {
    const url = buildOgImageUrl({
      editionCoverUrl: null,
      workCoverUrl: null,
      olCoverId: null,
      origin,
    })
    expect(url).toBe('https://meus-livros.app/og-fallback.png')
    expect(url).not.toContain('default=false')
  })

  it('serves /og-fallback.png for an isbn13-only edition (no cover_url, no ol_cover_id)', () => {
    // This is the real-world case: 64 ISBN-13 entries in the seed data have no
    // cover_url. The BookCover component uses ?default=false for <img> onerror
    // fallbacks — that is fine for rendering. Here, the og:image path must NOT
    // use that URL because WhatsApp's crawler would get a 404.
    const url = buildOgImageUrl({
      editionCoverUrl: null,
      workCoverUrl: null,
      olCoverId: null,
      origin,
    })
    expect(url).not.toMatch(/default=false/)
    expect(url).toBe('https://meus-livros.app/og-fallback.png')
  })
})

// ---------------------------------------------------------------------------
// resolveEntryOgImageUrl — integration of the above with LogWithDetails shape
// ---------------------------------------------------------------------------
describe('resolveEntryOgImageUrl', () => {
  const origin = 'https://meus-livros.app'

  function makeLog(overrides: Partial<LogWithDetails> = {}): LogWithDetails {
    return {
      id: 'log-1',
      user_id: 'user-1',
      work_id: 'work-1',
      edition_id: null,
      rating: null,
      review: null,
      started_on: null,
      finished_on: '2016-01-01',
      finished_precision: 'ano',
      format: null,
      visibility: 'publico',
      created_at: new Date(),
      updated_at: new Date(),
      user: {
        id: 'user-1',
        handle: 'diogo',
        display_name: 'Diogo',
        profile_visibility: 'publico',
      },
      work: {
        id: 'work-1',
        title: 'Dom Casmurro',
        slug: 'dom-casmurro',
        first_published_year: 1899,
        cover_url: null,
        authors: [],
      },
      edition: null,
      ...overrides,
    }
  }

  it('returns og-fallback.png when log has no cover info', () => {
    const url = resolveEntryOgImageUrl(makeLog(), origin)
    expect(url).toBe('https://meus-livros.app/og-fallback.png')
    expect(url).not.toContain('default=false')
  })

  it('uses edition cover_url when present', () => {
    const log = makeLog({
      edition_id: 'ed-1',
      edition: {
        id: 'ed-1',
        isbn13: '9788535914849',
        cover_url: 'https://covers.example.com/casmurro.jpg',
        ol_cover_id: null,
        publisher: null,
        page_count: null,
        published_year: null,
      },
    })
    const url = resolveEntryOgImageUrl(log, origin)
    expect(url).toBe('https://covers.example.com/casmurro.jpg')
  })
})

// ---------------------------------------------------------------------------
// formatReadingDate — CRITICAL: finished_precision='ano' must render year only
// ---------------------------------------------------------------------------
describe('formatReadingDate - precision rendering', () => {
  // The entire migrated acervo (86 entries) uses finished_precision='ano'.
  // Rendering a full date for these entries would make 100% of the content wrong.

  it('renders only the year when precision is "ano"', () => {
    expect(formatReadingDate('2016-01-01', 'ano')).toBe('2016')
    expect(formatReadingDate('2021-06-15', 'ano')).toBe('2021')
    expect(formatReadingDate('1999-12-31', 'ano')).toBe('1999')
  })

  it('renders month and year in pt-BR when precision is "mes"', () => {
    const result = formatReadingDate('2021-06-15', 'mes')
    expect(result).toContain('junho')
    expect(result).toContain('2021')
    expect(result).not.toContain('15')
  })

  it('renders full date in pt-BR when precision is "dia"', () => {
    const result = formatReadingDate('2021-06-15', 'dia')
    expect(result).toContain('junho')
    expect(result).toContain('2021')
    expect(result).toContain('15')
  })

  it('returns empty string for null or undefined', () => {
    expect(formatReadingDate(null, 'dia')).toBe('')
    expect(formatReadingDate(undefined, 'ano')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// formatBookFormat
// ---------------------------------------------------------------------------
describe('formatBookFormat', () => {
  it('returns "Livro físico" for "fisico"', () => {
    expect(formatBookFormat('fisico')).toBe('Livro físico')
  })

  it('returns "E-book" for "ebook"', () => {
    expect(formatBookFormat('ebook')).toBe('E-book')
  })

  it('returns "Audiolivro" for "audio"', () => {
    expect(formatBookFormat('audio')).toBe('Audiolivro')
  })

  it('returns empty string for unknown format', () => {
    expect(formatBookFormat(null)).toBe('')
    expect(formatBookFormat(undefined)).toBe('')
    expect(formatBookFormat('unknown')).toBe('')
  })
})
