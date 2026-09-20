import type { BookFormat, DatePrecision, LogWithDetails } from '~~/shared/schemas/log'

/**
 * Formats rating as stars string (e.g. 4.5 -> "★★★★½", 3 -> "★★★").
 * Returns an empty string for null, 0 or invalid ratings.
 */
export function formatRatingStars(rating?: number | null): string {
  if (rating == null || rating <= 0 || Number.isNaN(rating)) {
    return ''
  }
  return '★'.repeat(Math.floor(rating)) + (rating % 1 !== 0 ? '½' : '')
}

/**
 * Builds the Open Graph title according to spec:
 * "{title} — ★★★★½ por @{handle}"
 * Falls back to "{title} por @{handle}" if there is no rating.
 */
export function buildOgTitle(title: string, handle: string, rating?: number | null): string {
  const stars = formatRatingStars(rating)
  if (stars) {
    return `${title} — ${stars} por @${handle}`
  }
  return `${title} por @${handle}`
}

/**
 * Builds the Open Graph description according to spec:
 * First ~160 chars of the review, plain text.
 * Falls back to "{display_name} leu {title}" when there is no review.
 */
export function buildOgDescription(
  review: string | null | undefined,
  displayName: string,
  title: string,
): string {
  if (review && review.trim().length > 0) {
    const trimmed = review.trim()
    return trimmed.length > 160 ? trimmed.slice(0, 160) : trimmed
  }
  return `${displayName} leu ${title}`
}

/**
 * Validates if a URL is a valid absolute HTTP or HTTPS URL.
 */
export function isValidCoverUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false
  const trimmed = url.trim()
  if (!trimmed) return false
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * Ensures a path or URL is absolute with respect to origin.
 */
export function makeAbsoluteUrl(pathOrUrl: string, origin: string): string {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl
  }
  const cleanBase = origin.replace(/\/+$/, '')
  const cleanPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`
  return `${cleanBase}${cleanPath}`
}

export interface OgImageOptions {
  editionCoverUrl?: string | null
  workCoverUrl?: string | null
  olCoverId?: number | string | null
  origin: string
}

/**
 * Resolves the Open Graph image URL according to spec:
 * 1. Absolute cover URL from edition or work if present
 * 2. Open Library Cover ID if present
 * 3. Fallback static image (/og-fallback.png)
 *
 * CRITICAL (Requirement 5): og:image MUST NEVER carry `?default=false`.
 * An entry with no cover uses /og-fallback.png.
 */
export function buildOgImageUrl(options: OgImageOptions): string {
  const { editionCoverUrl, workCoverUrl, olCoverId, origin } = options

  // 1. Edition cover_url if valid
  if (editionCoverUrl && isValidCoverUrl(editionCoverUrl)) {
    return makeAbsoluteUrl(editionCoverUrl.trim(), origin)
  }

  // 2. Work cover_url if valid
  if (workCoverUrl && isValidCoverUrl(workCoverUrl)) {
    return makeAbsoluteUrl(workCoverUrl.trim(), origin)
  }

  // 3. Open Library Cover ID if present
  if (olCoverId != null && String(olCoverId).trim() !== '') {
    return `https://covers.openlibrary.org/b/id/${encodeURIComponent(String(olCoverId).trim())}-L.jpg`
  }

  // 4. Static fallback image — NEVER use ?default=false!
  return makeAbsoluteUrl('/og-fallback.png', origin)
}

/**
 * Resolves the cover URL from a LogWithDetails object.
 */
export function resolveEntryOgImageUrl(log: LogWithDetails, origin: string): string {
  return buildOgImageUrl({
    editionCoverUrl: log.edition?.cover_url,
    workCoverUrl: log.work?.cover_url,
    olCoverId: log.edition?.ol_cover_id,
    origin,
  })
}

/**
 * Formats reading date according to finished_precision:
 * - 'ano': renders only the year (e.g. "2016"), NOT "1 de janeiro de 2016"
 * - 'mes': renders month and year (e.g. "janeiro de 2016")
 * - 'dia': renders full date (e.g. "1 de janeiro de 2016")
 */
export function formatReadingDate(
  dateStr: string | null | undefined,
  precision: DatePrecision = 'dia',
): string {
  if (!dateStr || typeof dateStr !== 'string') return ''
  const parts = dateStr.split('-')
  if (parts.length < 3) return dateStr

  // `parts.length < 3` already returned, but TypeScript types index access as
  // possibly undefined; destructuring with defaults narrows without a cast.
  const [year = '', month = '', day = ''] = parts

  if (precision === 'ano') {
    return year
  }

  const d = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (Number.isNaN(d.getTime())) return dateStr

  if (precision === 'mes') {
    return new Intl.DateTimeFormat('pt-BR', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(d)
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d)
}

/**
 * Returns human-readable label for book format.
 */
export function formatBookFormat(format: BookFormat | string | null | undefined): string {
  switch (format) {
    case 'fisico':
      return 'Livro físico'
    case 'ebook':
      return 'E-book'
    case 'audio':
      return 'Audiolivro'
    default:
      return ''
  }
}
