import { z } from 'zod'

export const statsQuerySchema = z.object({
  ano: z.coerce.number().int().min(-9999).max(9999).optional(),
})

export type StatsQuery = z.infer<typeof statsQuerySchema>

export interface StatsCount {
  label: string
  count: number
}

export interface ReadingInsights {
  pages: {
    knownBooks: number
    average: number | null
    median: number | null
    longest: { title: string; slug: string; pages: number; authors: string[] } | null
  }
  bestYear: { year: number; books: number } | null
  pageRanges: StatsCount[]
  publicationPeriods: StatsCount[]
  genreRatings: { label: string; averageRating: number; count: number }[]
  publishers: StatsCount[]
  yearReview: {
    newAuthors: number
    bestRating: number | null
    bestBooks: { title: string; slug: string }[]
    previousYearBooks: number
  } | null
}

export interface StatsResponse {
  user: {
    handle: string
    display_name: string
  }
  year: number | null
  years: number[]
  insights: ReadingInsights
  totals: {
    books: number
    pages: number
    authors: number
    countries: number
    averageRating: number | null
  }
  byYear: {
    year: number
    books: number
    pages: number
  }[]
  genres: StatsCount[]
  authors: (StatsCount & { slug: string })[]
  countries: StatsCount[]
  languages: StatsCount[]
  ratings: {
    rating: number
    count: number
  }[]
  formats: {
    format: 'fisico' | 'ebook' | 'audio' | null
    count: number
  }[]
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'inglês',
  pt: 'português',
  de: 'alemão',
  ru: 'russo',
  fr: 'francês',
  zh: 'chinês',
  he: 'hebraico',
  no: 'norueguês',
  la: 'latim',
  es: 'espanhol',
  ja: 'japonês',
  it: 'italiano',
}

export function languageLabel(code: string | null | undefined): string {
  if (!code || !code.trim()) {
    return 'Não informado'
  }
  const normalized = code.trim().toLowerCase()
  return LANGUAGE_LABELS[normalized] ?? code.trim().toUpperCase()
}
