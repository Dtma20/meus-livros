import type { ReadingInsights } from '../../shared/schemas/stats'

// Input contains only finished readings already authorized by visibleLogs.
export interface InsightReading {
  title: string
  slug: string
  year: number
  pages: number | null
  publicationYear: number | null
  publisher: string | null
  rating: number | null
  authors: { slug: string; name: string }[]
  genres: string[]
}

export function getReadingInsights(allReadings: InsightReading[], year: number | null): ReadingInsights {
  const readings = year === null ? allReadings : allReadings.filter(reading => reading.year === year)
  const withPages = readings.filter((reading): reading is InsightReading & { pages: number } =>
    reading.pages !== null && reading.pages > 0,
  )
  const pages = withPages.map(reading => reading.pages).sort((a, b) => a - b)
  const middle = Math.floor(pages.length / 2)
  const longest = [...withPages].sort((a, b) =>
    b.pages - a.pages || a.title.localeCompare(b.title, 'pt-BR') || a.slug.localeCompare(b.slug),
  )[0]
  const yearCounts = new Map<number, number>()
  const periods = new Map<number, number>()
  const publisherCounts = new Map<string, { label: string; count: number }>()
  const genreRatings = new Map<string, { total: number; count: number }>()

  for (const reading of readings) {
    yearCounts.set(reading.year, (yearCounts.get(reading.year) ?? 0) + 1)
    const published = reading.publicationYear
    if (published !== null && published !== 0 && Number.isInteger(published)) {
      const century = Math.sign(published) * Math.ceil(Math.abs(published) / 100)
      periods.set(century, (periods.get(century) ?? 0) + 1)
    }
    const publisher = reading.publisher?.trim()
    if (publisher) {
      const key = publisher.toLocaleLowerCase('pt-BR')
      const row = publisherCounts.get(key) ?? { label: publisher, count: 0 }
      row.count++
      publisherCounts.set(key, row)
    }
    if (reading.rating !== null) {
      for (const label of new Set(reading.genres)) {
        const row = genreRatings.get(label) ?? { total: 0, count: 0 }
        row.total += reading.rating
        row.count++
        genreRatings.set(label, row)
      }
    }
  }

  const bestYear = [...yearCounts].sort(([a, ac], [b, bc]) => bc - ac || a - b)[0]
  const previousAuthors = new Set(allReadings.filter(reading => year !== null && reading.year < year)
    .flatMap(reading => reading.authors.map(author => author.slug)))
  const currentAuthors = new Set(readings.flatMap(reading => reading.authors.map(author => author.slug)))
  const ratings = readings.flatMap(reading => reading.rating === null ? [] : [reading.rating])
  const bestRating = ratings.length ? Math.max(...ratings) : null

  return {
    pages: {
      knownBooks: pages.length,
      average: pages.length ? pages.reduce((sum, count) => sum + count, 0) / pages.length : null,
      median: pages.length ? (pages.length % 2 ? pages[middle]! : (pages[middle - 1]! + pages[middle]!) / 2) : null,
      longest: longest ? { title: longest.title, slug: longest.slug, pages: longest.pages, authors: longest.authors.map(author => author.name) } : null,
    },
    bestYear: bestYear ? { year: bestYear[0], books: bestYear[1] } : null,
    pageRanges: [
      { label: 'Até 199 páginas', count: pages.filter(count => count < 200).length },
      { label: '200 a 399 páginas', count: pages.filter(count => count >= 200 && count < 400).length },
      { label: '400 a 599 páginas', count: pages.filter(count => count >= 400 && count < 600).length },
      { label: '600 páginas ou mais', count: pages.filter(count => count >= 600).length },
    ],
    publicationPeriods: [...periods].sort(([a], [b]) => a - b).map(([century, count]) => ({
      label: `Século ${Math.abs(century)}${century < 0 ? ' a.C.' : ''}`, count,
    })),
    genreRatings: [...genreRatings].filter(([, row]) => row.count >= 3)
      .map(([label, row]) => ({ label, averageRating: row.total / row.count, count: row.count }))
      .sort((a, b) => b.averageRating - a.averageRating || b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'))
      .slice(0, 10),
    publishers: [...publisherCounts.values()]
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR')).slice(0, 10),
    yearReview: year === null ? null : {
      newAuthors: [...currentAuthors].filter(author => !previousAuthors.has(author)).length,
      bestRating,
      bestBooks: readings.filter(reading => bestRating !== null && reading.rating === bestRating)
        .filter((reading, index, list) => list.findIndex(other => other.slug === reading.slug) === index)
        .map(reading => ({ title: reading.title, slug: reading.slug }))
        .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR') || a.slug.localeCompare(b.slug)),
      previousYearBooks: allReadings.filter(reading => reading.year === year - 1).length,
    },
  }
}
