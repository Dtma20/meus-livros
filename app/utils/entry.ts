import { isHttpsCoverUrl } from '~~/shared/schemas/work'
import type { BookFormat, DatePrecision, LogWithDetails } from '~~/shared/schemas/log'

export function formatRatingStars(rating?: number | null): string {
  if (rating == null || rating <= 0 || Number.isNaN(rating)) {
    return ''
  }
  return '★'.repeat(Math.floor(rating)) + (rating % 1 !== 0 ? '½' : '')
}

export function buildOgTitle(title: string, handle: string, rating?: number | null): string {
  const stars = formatRatingStars(rating)
  if (stars) {
    return `${title} - ${stars} por @${handle}`
  }
  return `${title} por @${handle}`
}

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

export function isValidCoverUrl(url: string | null | undefined): boolean {
  return isHttpsCoverUrl(url)
}

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

export function buildOgImageUrl(options: OgImageOptions): string {
  const { editionCoverUrl, workCoverUrl, olCoverId, origin } = options

  if (editionCoverUrl && isValidCoverUrl(editionCoverUrl)) {
    return makeAbsoluteUrl(editionCoverUrl.trim(), origin)
  }

  if (workCoverUrl && isValidCoverUrl(workCoverUrl)) {
    return makeAbsoluteUrl(workCoverUrl.trim(), origin)
  }

  if (olCoverId != null && String(olCoverId).trim() !== '') {
    return `https://covers.openlibrary.org/b/id/${encodeURIComponent(String(olCoverId).trim())}-L.jpg`
  }

  return makeAbsoluteUrl('/og-fallback.png', origin)
}

export function resolveEntryOgImageUrl(log: LogWithDetails, origin: string): string {
  return buildOgImageUrl({
    editionCoverUrl: log.edition?.cover_url,
    workCoverUrl: log.work?.cover_url,
    olCoverId: log.edition?.ol_cover_id,
    origin,
  })
}

export function formatReadingDate(
  dateStr: string | null | undefined,
  precision: DatePrecision = 'dia',
): string {
  if (!dateStr || typeof dateStr !== 'string') return ''
  const parts = dateStr.split('-')
  if (parts.length < 3) return dateStr

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
