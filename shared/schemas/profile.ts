import type { BookFormat, DatePrecision, LogVisibility } from './log'

export interface ProfileAuthorView {
  id: string
  name: string
  slug: string
  country_code: string | null
  country_label: string | null
}

export interface ProfileGenreView {
  id: number
  slug: string
  label_pt: string
}

export interface ProfileWorkView {
  id: string
  title: string
  slug: string
  first_published_year: number | null
  cover_url: string | null
  authors: ProfileAuthorView[]
  genres: ProfileGenreView[]
}

export interface ProfileEditionView {
  id: string | null
  isbn13: string | null
  publisher: string | null
  page_count: number | null
  published_year: number | null
  cover_url: string | null
  ol_cover_id: number | null
}

export interface ProfileLogItem {
  id: string
  rating: number | null
  review: string | null
  started_on: string | null
  finished_on: string | null
  finished_precision: DatePrecision
  format: BookFormat | null
  visibility: LogVisibility
  created_at: string | Date
  work: ProfileWorkView
  edition: ProfileEditionView | null
}

export interface ProfileUserView {
  id: string
  handle: string
  display_name: string
  bio: string | null
  profile_visibility: LogVisibility
  created_at: string | Date
}

export interface ProfileStats {
  totalBooks: number
  uniqueAuthors: number
  uniqueCountries: number
  totalPages: number
  averagePages: number
}

export interface ProfileResponse {
  user: ProfileUserView
  logs: ProfileLogItem[]
  stats: ProfileStats
}

let ptBrRegionNames: Intl.DisplayNames | null = null

function getRegionNames(): Intl.DisplayNames {
  if (!ptBrRegionNames) {
    ptBrRegionNames = new Intl.DisplayNames(['pt-BR'], { type: 'region' })
  }
  return ptBrRegionNames
}

/**
 * Resolves an author's country into a display string in pt-BR.
 *
 * Requirements:
 * - If country_code is present (e.g. 'GB', 'US'), formats via Intl.DisplayNames('pt-BR')
 *   (e.g. 'Reino Unido', 'Estados Unidos').
 * - If country_code is null/invalid, falls back to country_label (e.g. 'Roma Antiga').
 */
export function formatCountryName(
  countryCode: string | null | undefined,
  countryLabel?: string | null,
): string {
  if (countryCode && countryCode.trim()) {
    try {
      const formatted = getRegionNames().of(countryCode.trim().toUpperCase())
      if (formatted) return formatted
    } catch {
      // Invalid region code: fall through to label
    }
  }
  return countryLabel?.trim() || ''
}
