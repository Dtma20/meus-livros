import { formatCountryName, type ProfileLogItem } from '~~/shared/schemas/profile'

export interface AggregatedReadingMapData {
  countryCounts: Record<string, number>
  totalMappedCountries: number
  unmappedCountries: string[]
}

const ISO_3166_1_ALPHA_2_REGEX = /^[A-Z]{2}$/

export function aggregateReadingMapData(logs: ProfileLogItem[]): AggregatedReadingMapData {
  const countryCounts: Record<string, number> = {}
  const unmappedCountriesSet = new Set<string>()

  for (const log of logs) {
    const seenCodesInLog = new Set<string>()

    for (const author of log.work?.authors || []) {
      const rawCode = author.country_code?.trim().toUpperCase()

      if (rawCode && ISO_3166_1_ALPHA_2_REGEX.test(rawCode)) {
        if (!seenCodesInLog.has(rawCode)) {
          seenCodesInLog.add(rawCode)
          countryCounts[rawCode] = (countryCounts[rawCode] || 0) + 1
        }
      } else {
        const label = formatCountryName(author.country_code, author.country_label)
        if (label) {
          unmappedCountriesSet.add(label)
        }
      }
    }
  }

  const unmappedCountries = Array.from(unmappedCountriesSet).sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  )
  const totalMappedCountries = Object.keys(countryCounts).length

  return {
    countryCounts,
    totalMappedCountries,
    unmappedCountries,
  }
}

export function getMapColorTier(count: number, maxCount: number): number {
  if (count <= 0) return 0
  if (maxCount <= 1) return 4
  const ratio = count / maxCount
  if (ratio <= 0.25) return 1
  if (ratio <= 0.50) return 2
  if (ratio <= 0.75) return 3
  return 4
}
