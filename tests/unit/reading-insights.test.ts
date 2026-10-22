import { describe, expect, it } from 'vitest'
import { getReadingInsights, type InsightReading } from '../../server/services/reading-insights'

function reading(overrides: Partial<InsightReading> = {}): InsightReading {
  return {
    title: 'Um livro', slug: 'um-livro', year: 2024, pages: 200,
    publicationYear: 2001, publisher: 'Editora', rating: 4,
    authors: [{ slug: 'autora', name: 'Autora' }], genres: ['Ficção'],
    ...overrides,
  }
}

describe('reading insights from visible, finished readings', () => {
  it('excludes unknown pages from averages and computes even and odd medians', () => {
    const stats = getReadingInsights([
      reading({ pages: 100 }), reading({ pages: 300 }), reading({ pages: null }),
    ], null)
    expect(stats.pages).toMatchObject({ knownBooks: 2, average: 200, median: 200 })
    expect(stats.pageRanges.map(row => row.count)).toEqual([1, 1, 0, 0])
    expect(getReadingInsights([reading({ pages: 100 }), reading({ pages: 600 }), reading({ pages: 300 })], null).pages.median).toBe(300)
    expect(getReadingInsights([], null).pages).toEqual({ knownBooks: 0, average: null, median: null, longest: null })
  })

  it('uses deterministic ties and keeps ancient publication years separate from reading years', () => {
    const stats = getReadingInsights([
      reading({ title: 'Zeta', year: 2025, publicationYear: -500, pages: 600 }),
      reading({ title: 'Alfa', slug: 'alfa', year: 2024, publicationYear: 1900, pages: 600 }),
      reading({ year: 2026, publicationYear: 1901, pages: 199 }),
      reading({ year: 2027, publicationYear: null, pages: 400 }),
    ], null)
    expect(stats.pages.longest).toMatchObject({ title: 'Alfa', slug: 'alfa', pages: 600 })
    expect(stats.bestYear).toEqual({ year: 2024, books: 1 })
    expect(stats.publicationPeriods).toEqual([
      { label: 'Século 5 a.C.', count: 1 }, { label: 'Século 19', count: 1 }, { label: 'Século 20', count: 1 },
    ])
    expect(stats.pageRanges.map(row => row.count)).toEqual([1, 0, 1, 2])
  })

  it('requires three ratings per genre, deduplicates genres per reading and normalizes publishers', () => {
    const stats = getReadingInsights([
      reading({ rating: 5, genres: ['Ficção', 'Ficção', 'Fantasia'], publisher: ' Editora ' }),
      reading({ rating: 4, publisher: 'editora' }),
      reading({ rating: 3, publisher: null }),
      reading({ rating: null, publisher: '' }),
    ], null)
    expect(stats.genreRatings).toEqual([{ label: 'Ficção', averageRating: 4, count: 3 }])
    expect(stats.publishers).toEqual([{ label: 'Editora', count: 2 }])
  })

  it('filters all highlights by year and compares authors against earlier visible readings only', () => {
    const stats = getReadingInsights([
      reading({ year: 2023, authors: [{ slug: 'antiga', name: 'Antiga' }] }),
      reading({ year: 2024, rating: 5, authors: [{ slug: 'antiga', name: 'Antiga' }, { slug: 'nova', name: 'Nova' }] }),
      reading({ year: 2024, title: 'Outro', slug: 'outro', pages: 400, rating: 5, authors: [{ slug: 'nova', name: 'Nova' }] }),
      reading({ year: 2025, pages: 900, authors: [{ slug: 'futura', name: 'Futura' }] }),
    ], 2024)
    expect(stats.pages).toMatchObject({ knownBooks: 2, average: 300, median: 300 })
    expect(stats.yearReview).toEqual({
      newAuthors: 1, bestRating: 5,
      bestBooks: [{ title: 'Outro', slug: 'outro' }, { title: 'Um livro', slug: 'um-livro' }],
      previousYearBooks: 1,
    })
    expect(getReadingInsights([], 2024).yearReview).toEqual({ newAuthors: 0, bestRating: null, bestBooks: [], previousYearBooks: 0 })
  })
})
