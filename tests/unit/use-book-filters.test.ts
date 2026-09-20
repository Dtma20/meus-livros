import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useBookFilters } from '../../app/composables/useBookFilters'
import type { ProfileLogItem } from '../../shared/schemas/profile'
import { formatCountryName } from '../../shared/schemas/profile'

function createSampleLog(overrides: Partial<ProfileLogItem> & {
  title?: string
  authorCountryCode?: string | null
  authorCountryLabel?: string | null
  authorName?: string
  genres?: Array<{ id: number; slug: string; label_pt: string }>
  year?: number | null
  pageCount?: number | null
}): ProfileLogItem {
  const title = overrides.title ?? 'Livro Teste'
  const authors = overrides.authorName
    ? [
        {
          id: 'author-1',
          name: overrides.authorName,
          slug: 'author-slug',
          country_code: overrides.authorCountryCode ?? null,
          country_label: overrides.authorCountryLabel ?? null,
        },
      ]
    : []

  return {
    id: overrides.id ?? `log-${Math.random().toString(36).slice(2)}`,
    rating: overrides.rating !== undefined ? overrides.rating : 4,
    review: overrides.review ?? null,
    started_on: overrides.started_on ?? null,
    finished_on: overrides.finished_on !== undefined ? overrides.finished_on : '2024-01-01',
    finished_precision: overrides.finished_precision ?? 'dia',
    format: overrides.format ?? 'fisico',
    visibility: overrides.visibility ?? 'publico',
    created_at: overrides.created_at ?? new Date('2024-01-01T12:00:00Z'),
    work: {
      id: `work-${Math.random().toString(36).slice(2)}`,
      title,
      slug: 'slug',
      first_published_year: overrides.year !== undefined ? overrides.year : 2020,
      cover_url: null,
      authors,
      genres: overrides.genres ?? [{ id: 1, slug: 'ficcao', label_pt: 'Ficção' }],
    },
    edition: {
      id: 'edition-1',
      isbn13: '9788598078397',
      publisher: 'Editora Teste',
      page_count: overrides.pageCount !== undefined ? overrides.pageCount : 200,
      published_year: overrides.year !== undefined ? overrides.year : 2020,
      cover_url: null,
      ol_cover_id: null,
    },
  }
}

describe('shared/schemas/profile: formatCountryName', () => {
  it('formats ISO country code GB as "Reino Unido" in pt-BR', () => {
    expect(formatCountryName('GB', 'Reino Unido')).toBe('Reino Unido')
  })

  it('formats ISO country code US as "Estados Unidos" in pt-BR', () => {
    expect(formatCountryName('US', 'EUA')).toBe('Estados Unidos')
  })

  it('formats ISO country code BR as "Brasil" in pt-BR', () => {
    expect(formatCountryName('BR', 'Brasil')).toBe('Brasil')
  })

  it('falls back to country_label for non-ISO "Roma Antiga" where code is null', () => {
    expect(formatCountryName(null, 'Roma Antiga')).toBe('Roma Antiga')
    expect(formatCountryName('', 'Roma Antiga')).toBe('Roma Antiga')
  })

  it('returns empty string when both code and label are absent', () => {
    expect(formatCountryName(null, null)).toBe('')
    expect(formatCountryName(undefined, undefined)).toBe('')
  })
})

describe('app/composables/useBookFilters', () => {
  it('Requirement 4 bugfix: filterCountry initialises to "" (not null)', () => {
    const logs = ref<ProfileLogItem[]>([])
    const { filterCountry, filterGenre, filterDecade } = useBookFilters(logs)

    expect(filterCountry.value).toBe('')
    expect(filterGenre.value).toBe('')
    expect(filterDecade.value).toBe('')
  })

  it('Requirement 5: sorting by "read_desc" (Lidos Recentemente) with equal finished_on falls back to created_at DESC', () => {
    const logA = createSampleLog({
      id: 'log-A',
      title: 'Livro Mais Antigo no Acervo',
      finished_on: '2023-01-01',
      created_at: new Date('2023-01-01T10:00:00Z'),
    })
    const logB = createSampleLog({
      id: 'log-B',
      title: 'Livro Mais Recente no Acervo',
      finished_on: '2023-01-01',
      created_at: new Date('2023-01-01T10:05:00Z'),
    })

    const logs = ref([logA, logB])
    const { sortedBooks, sortBy } = useBookFilters(logs)
    sortBy.value = 'read_desc'

    expect(sortedBooks.value[0]?.id).toBe('log-B')
    expect(sortedBooks.value[1]?.id).toBe('log-A')
  })

  it('Requirement 5: sorting by "read_asc" (Lidos Antigamente) with equal finished_on falls back to created_at ASC', () => {
    const logA = createSampleLog({
      id: 'log-A',
      finished_on: '2023-01-01',
      created_at: new Date('2023-01-01T10:00:00Z'),
    })
    const logB = createSampleLog({
      id: 'log-B',
      finished_on: '2023-01-01',
      created_at: new Date('2023-01-01T10:05:00Z'),
    })

    const logs = ref([logB, logA])
    const { sortedBooks, sortBy } = useBookFilters(logs)
    sortBy.value = 'read_asc'

    expect(sortedBooks.value[0]?.id).toBe('log-A')
    expect(sortedBooks.value[1]?.id).toBe('log-B')
  })

  it('Requirement 5: sorting by "rating" (Melhores Notas) falls back to created_at DESC for equal ratings', () => {
    const logA = createSampleLog({
      id: 'log-A',
      rating: 5,
      created_at: new Date('2024-01-01T10:00:00Z'),
    })
    const logB = createSampleLog({
      id: 'log-B',
      rating: 5,
      created_at: new Date('2024-01-01T10:10:00Z'),
    })

    const logs = ref([logA, logB])
    const { sortedBooks, sortBy } = useBookFilters(logs)
    sortBy.value = 'rating'

    expect(sortedBooks.value[0]?.id).toBe('log-B')
    expect(sortedBooks.value[1]?.id).toBe('log-A')
  })

  it('Requirement 5: sorting by "year_desc" (Publicação Novo) falls back to created_at DESC', () => {
    const logA = createSampleLog({
      id: 'log-A',
      year: 2021,
      created_at: new Date('2024-01-01T10:00:00Z'),
    })
    const logB = createSampleLog({
      id: 'log-B',
      year: 2021,
      created_at: new Date('2024-01-01T10:10:00Z'),
    })

    const logs = ref([logA, logB])
    const { sortedBooks, sortBy } = useBookFilters(logs)
    sortBy.value = 'year_desc'

    expect(sortedBooks.value[0]?.id).toBe('log-B')
    expect(sortedBooks.value[1]?.id).toBe('log-A')
  })

  it('Requirement 5: sorting by "year_asc" (Publicação Velho) falls back to created_at ASC', () => {
    const logA = createSampleLog({
      id: 'log-A',
      year: 1984,
      created_at: new Date('2024-01-01T10:00:00Z'),
    })
    const logB = createSampleLog({
      id: 'log-B',
      year: 1984,
      created_at: new Date('2024-01-01T10:10:00Z'),
    })

    const logs = ref([logB, logA])
    const { sortedBooks, sortBy } = useBookFilters(logs)
    sortBy.value = 'year_asc'

    expect(sortedBooks.value[0]?.id).toBe('log-A')
    expect(sortedBooks.value[1]?.id).toBe('log-B')
  })

  it('Requirement 5: sorting by "alpha" (A-Z) falls back to created_at ASC for identical titles', () => {
    const logA = createSampleLog({
      id: 'log-A',
      title: 'Mesmo Título',
      created_at: new Date('2024-01-01T10:00:00Z'),
    })
    const logB = createSampleLog({
      id: 'log-B',
      title: 'Mesmo Título',
      created_at: new Date('2024-01-01T10:10:00Z'),
    })

    const logs = ref([logB, logA])
    const { sortedBooks, sortBy } = useBookFilters(logs)
    sortBy.value = 'alpha'

    expect(sortedBooks.value[0]?.id).toBe('log-A')
    expect(sortedBooks.value[1]?.id).toBe('log-B')
  })

  it('Requirement 6: header counters are global; footer counters follow active filters', () => {
    const log1 = createSampleLog({
      id: 'log-1',
      title: 'Livro Ficção',
      authorName: 'Autor 1',
      authorCountryCode: 'BR',
      genres: [{ id: 1, slug: 'ficcao', label_pt: 'Ficção' }],
      pageCount: 300,
    })
    const log2 = createSampleLog({
      id: 'log-2',
      title: 'Livro Filosofia',
      authorName: 'Autor 2',
      authorCountryLabel: 'Roma Antiga',
      genres: [{ id: 2, slug: 'filosofia', label_pt: 'Filosofia' }],
      pageCount: 100,
    })

    const logs = ref([log1, log2])
    const {
      filterGenre,
      sortedBooks,
      globalStats,
      filteredStats,
      hasActiveFilters,
      resetFilters,
    } = useBookFilters(logs)

    // Initially, no filters active
    expect(hasActiveFilters.value).toBe(false)
    expect(globalStats.value.totalBooks).toBe(2)
    expect(globalStats.value.uniqueAuthors).toBe(2)
    expect(globalStats.value.uniqueCountries).toBe(2) // Brasil + Roma Antiga
    expect(globalStats.value.totalPages).toBe(400)
    expect(globalStats.value.averagePages).toBe(200)

    expect(filteredStats.value.totalBooks).toBe(2)
    expect(filteredStats.value.totalPages).toBe(400)

    // Filter by Ficção
    filterGenre.value = 'Ficção'
    expect(hasActiveFilters.value).toBe(true)
    expect(sortedBooks.value).toHaveLength(1)
    expect(sortedBooks.value[0]?.id).toBe('log-1')

    // Header counters remain global (2 books, 2 authors, 2 countries)
    expect(globalStats.value.totalBooks).toBe(2)
    expect(globalStats.value.uniqueAuthors).toBe(2)
    expect(globalStats.value.uniqueCountries).toBe(2)

    // Footer counters follow active filter (1 book, 300 pages)
    expect(filteredStats.value.totalBooks).toBe(1)
    expect(filteredStats.value.totalPages).toBe(300)
    expect(filteredStats.value.averagePages).toBe(300)

    // Reset filters
    resetFilters()
    expect(hasActiveFilters.value).toBe(false)
    expect(sortedBooks.value).toHaveLength(2)
    expect(filteredStats.value.totalBooks).toBe(2)
  })

  it('Decade filtering handles standard decades and ancient / negative years', () => {
    const logModern = createSampleLog({
      id: 'modern',
      year: 2015,
    })
    const logAncient = createSampleLog({
      id: 'ancient',
      year: -49, // Math.floor(-49 / 10) * 10 = -50
    })

    const logs = ref([logModern, logAncient])
    const { availableDecades, filterDecade, sortedBooks } = useBookFilters(logs)

    expect(availableDecades.value).toContain(2010)
    expect(availableDecades.value).toContain(-50)

    filterDecade.value = -50
    expect(sortedBooks.value).toHaveLength(1)
    expect(sortedBooks.value[0]?.id).toBe('ancient')
  })
})
