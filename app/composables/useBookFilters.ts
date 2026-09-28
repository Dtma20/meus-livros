import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue'
import type { ProfileLogItem, ProfileStats } from '~~/shared/schemas/profile'
import { formatCountryName } from '~~/shared/schemas/profile'

export type SortMode = 'read_desc' | 'read_asc' | 'rating' | 'year_desc' | 'year_asc' | 'alpha'

export function useBookFilters(initialLogs: MaybeRefOrGetter<ProfileLogItem[]>) {
  const filterGenre = ref<string>('')
  const filterCountry = ref<string>('')
  const filterDecade = ref<string | number>('')
  const sortBy = ref<SortMode>('read_desc')

  const logs = computed(() => toValue(initialLogs) || [])

  function getLogDecade(log: ProfileLogItem): number | null {
    const year = log.work.first_published_year ?? log.edition?.published_year ?? null
    if (year === null || isNaN(year)) return null
    return Math.floor(year / 10) * 10
  }

  function getLogCountries(log: ProfileLogItem): string[] {
    const list: string[] = []
    for (const author of log.work.authors || []) {
      const name = formatCountryName(author.country_code, author.country_label)
      if (name && !list.includes(name)) {
        list.push(name)
      }
    }
    return list
  }

  function getLogGenres(log: ProfileLogItem): string[] {
    return (log.work.genres || []).map((g) => g.label_pt)
  }

  const availableGenres = computed(() => {
    const set = new Set<string>()
    for (const log of logs.value) {
      for (const genre of getLogGenres(log)) {
        set.add(genre)
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  })

  const availableCountries = computed(() => {
    const set = new Set<string>()
    for (const log of logs.value) {
      for (const country of getLogCountries(log)) {
        set.add(country)
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  })

  const availableDecades = computed(() => {
    const set = new Set<number>()
    for (const log of logs.value) {
      const decade = getLogDecade(log)
      if (decade !== null) {
        set.add(decade)
      }
    }
    return [...set].sort((a, b) => b - a)
  })

  const hasActiveFilters = computed(() => {
    return Boolean(
      filterGenre.value !== '' ||
      filterCountry.value !== '' ||
      (filterDecade.value !== '' && filterDecade.value !== null && filterDecade.value !== undefined)
    )
  })

  function resetFilters() {
    filterGenre.value = ''
    filterCountry.value = ''
    filterDecade.value = ''
  }

  const sortedBooks = computed(() => {
    let list = [...logs.value]

    if (filterGenre.value) {
      list = list.filter((log) => getLogGenres(log).includes(filterGenre.value))
    }

    if (filterCountry.value) {
      list = list.filter((log) => getLogCountries(log).includes(filterCountry.value))
    }

    if (filterDecade.value !== '' && filterDecade.value !== null && filterDecade.value !== undefined) {
      const targetDecade = Number(filterDecade.value)
      list = list.filter((log) => getLogDecade(log) === targetDecade)
    }

    return list.sort((a, b) => {
      const timeA = new Date(a.created_at).getTime()
      const timeB = new Date(b.created_at).getTime()

      if (sortBy.value === 'read_desc') {
        const dateA = a.finished_on ? new Date(a.finished_on).getTime() : 0
        const dateB = b.finished_on ? new Date(b.finished_on).getTime() : 0
        const diff = dateB - dateA
        return diff === 0 ? timeB - timeA : diff
      }

      if (sortBy.value === 'read_asc') {
        const dateA = a.finished_on ? new Date(a.finished_on).getTime() : Number.MAX_SAFE_INTEGER
        const dateB = b.finished_on ? new Date(b.finished_on).getTime() : Number.MAX_SAFE_INTEGER
        const diff = dateA - dateB
        return diff === 0 ? timeA - timeB : diff
      }

      if (sortBy.value === 'rating') {
        const rateA = Number(a.rating) || 0
        const rateB = Number(b.rating) || 0
        const diff = rateB - rateA
        return diff === 0 ? timeB - timeA : diff
      }

      if (sortBy.value === 'year_desc') {
        const yearA = Number(a.work.first_published_year) || 0
        const yearB = Number(b.work.first_published_year) || 0
        const diff = yearB - yearA
        return diff === 0 ? timeB - timeA : diff
      }

      if (sortBy.value === 'year_asc') {
        const yearA = Number(a.work.first_published_year) || 0
        const yearB = Number(b.work.first_published_year) || 0
        const diff = yearA - yearB
        return diff === 0 ? timeA - timeB : diff
      }

      if (sortBy.value === 'alpha') {
        const diff = a.work.title.localeCompare(b.work.title, 'pt-BR')
        return diff === 0 ? timeA - timeB : diff
      }

      return 0
    })
  })

  function calculateStats(items: ProfileLogItem[]): ProfileStats {
    const totalBooks = items.length
    const authorSet = new Set<string>()
    const countrySet = new Set<string>()
    let totalPages = 0

    for (const item of items) {
      for (const author of item.work.authors || []) {
        authorSet.add(author.name || author.id)
        const country = formatCountryName(author.country_code, author.country_label)
        if (country) countrySet.add(country)
      }
      totalPages += item.edition?.page_count || 0
    }

    const averagePages = totalBooks === 0 ? 0 : Math.round(totalPages / totalBooks)

    return {
      totalBooks,
      uniqueAuthors: authorSet.size,
      uniqueCountries: countrySet.size,
      totalPages,
      averagePages,
    }
  }

  const globalStats = computed(() => calculateStats(logs.value))

  const filteredStats = computed(() => calculateStats(sortedBooks.value))

  return {
    filterGenre,
    filterCountry,
    filterDecade,
    sortBy,
    availableGenres,
    availableCountries,
    availableDecades,
    hasActiveFilters,
    resetFilters,
    sortedBooks,
    globalStats,
    filteredStats,
  }
}
