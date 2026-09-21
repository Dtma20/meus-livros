import { WORLD_MAP_PATHS } from '~/assets/world-map'
import { formatCountryName, type ProfileLogItem } from '~~/shared/schemas/profile'

export interface AggregatedReadingMapData {
  /** Map of ISO 3166-1 alpha-2 uppercase country codes to number of books */
  countryCounts: Record<string, number>
  /** Total number of unique countries with an ISO code represented on the map */
  totalMappedCountries: number
  /** Names/labels of countries that cannot be placed on the map (e.g. no ISO code) */
  unmappedCountries: string[]
}

/**
 * Aggregates country data for the reading map from a list of profile reading logs.
 *
 * Rules:
 * - Reads country_code (ISO 3166-1 alpha-2) from author(s) of each work.
 * - Counts 1 book per unique country per log (a book with multiple authors from
 *   different countries counts for both countries; a book with multiple authors
 *   from the same country counts once for that country).
 * - Authors without a valid ISO code in the map geometry (e.g. 'Roma Antiga'
 *   where country_code is null) are excluded from countryCounts but collected
 *   in unmappedCountries for the descriptive note.
 */
export function aggregateReadingMapData(logs: ProfileLogItem[]): AggregatedReadingMapData {
  const countryCounts: Record<string, number> = {}
  const unmappedCountriesSet = new Set<string>()

  for (const log of logs) {
    const seenCodesInLog = new Set<string>()

    for (const author of log.work?.authors || []) {
      const rawCode = author.country_code?.trim().toUpperCase()

      if (rawCode && rawCode in WORLD_MAP_PATHS) {
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

/**
 * Computes the color tier (0-4) for a country based on its book count.
 * Tier 0: 0 books
 * Tier 1: 1 - 25% of max
 * Tier 2: 26 - 50% of max
 * Tier 3: 51 - 75% of max
 * Tier 4: 76 - 100% of max (or single-country profile)
 */
export function getMapColorTier(count: number, maxCount: number): number {
  if (count <= 0) return 0
  if (maxCount <= 1) return 4
  const ratio = count / maxCount
  if (ratio <= 0.25) return 1
  if (ratio <= 0.50) return 2
  if (ratio <= 0.75) return 3
  return 4
}
