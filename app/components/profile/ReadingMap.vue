<template>
  <div class="reading-map-card" role="region" aria-label="Mapa de leituras">
    <div class="map-header">
      <div class="map-title-row">
        <h2 class="map-title">Mapa de leituras</h2>
        <div class="map-status" aria-live="polite">
          <template v-if="activeInfo">
            <span class="country-name">{{ activeInfo.name }}</span>
            <span class="country-count">
              {{ activeInfo.count }} {{ activeInfo.count === 1 ? 'livro' : 'livros' }}
            </span>
            <button
              v-if="selectedCountry && isSelectedName(activeInfo.name)"
              type="button"
              class="clear-filter-btn"
              aria-label="Limpar filtro de país"
              @click="clearSelection"
            >
              Limpar &times;
            </button>
          </template>
          <template v-else-if="selectedCountry">
            <span class="country-name">{{ selectedCountry }}</span>
            <button
              type="button"
              class="clear-filter-btn"
              aria-label="Limpar filtro de país"
              @click="clearSelection"
            >
              Limpar &times;
            </button>
          </template>
          <template v-else>
            <span class="map-summary">
              {{ totalMappedCountries }} {{ totalMappedCountries === 1 ? 'país registrado' : 'países registrados' }}
            </span>
          </template>
        </div>
      </div>
    </div>

    <div class="map-svg-wrapper">
      <svg
        :viewBox="WORLD_MAP_VIEW_BOX"
        class="world-map-svg"
        role="img"
        :aria-label="mapAriaLabel"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g
          v-for="(paths, isoCode) in WORLD_MAP_PATHS"
          :key="isoCode"
          :class="[
            'country-group',
            getTierClass(isoCode),
            {
              'has-books': getCount(isoCode) > 0,
              'is-selected': isCodeSelected(isoCode),
              'is-dimmed': hasActiveSelection && !isCodeSelected(isoCode),
            },
          ]"
          aria-hidden="true"
          @click="onCountryClick(isoCode)"
          @mouseenter="onCountryHover(isoCode)"
          @mouseleave="onCountryLeave"
        >
          <path
            v-for="(d, i) in paths"
            :key="i"
            :d="d"
          />
        </g>
      </svg>
    </div>

    <p v-if="unmappedNote" class="unmapped-note">
      {{ unmappedNote }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { WORLD_MAP_PATHS, WORLD_MAP_VIEW_BOX } from '~/assets/world-map'
import { getMapColorTier } from '~/utils/reading-map'
import { formatCountryName } from '~~/shared/schemas/profile'

const props = withDefaults(
  defineProps<{
    countryCounts: Record<string, number>
    selectedCountry?: string
    unmappedCountries?: string[]
  }>(),
  {
    selectedCountry: '',
    unmappedCountries: () => [],
  },
)

const emit = defineEmits<{
  (e: 'select', country: string): void
}>()

const hoveredCountry = ref<{ code: string; name: string; count: number } | null>(null)

// Cache for formatted country names in pt-BR
const nameCache = new Map<string, string>()

function getCountryName(isoCode: string): string {
  const code = isoCode.trim().toUpperCase()
  let name = nameCache.get(code)
  if (!name) {
    name = formatCountryName(code) || code
    nameCache.set(code, name)
  }
  return name
}

function getCount(isoCode: string): number {
  return props.countryCounts[isoCode] || 0
}

const maxCount = computed(() => {
  const counts = Object.values(props.countryCounts)
  if (counts.length === 0) return 0
  return Math.max(0, ...counts)
})

function getTierClass(isoCode: string): string {
  const count = getCount(isoCode)
  const tier = getMapColorTier(count, maxCount.value)
  return `tier-${tier}`
}

function isCodeSelected(isoCode: string): boolean {
  if (!props.selectedCountry) return false
  return getCountryName(isoCode) === props.selectedCountry
}

function isSelectedName(name: string): boolean {
  if (!props.selectedCountry) return false
  return props.selectedCountry === name
}

const hasActiveSelection = computed(() => Boolean(props.selectedCountry))

const totalMappedCountries = computed(() => {
  let count = 0
  for (const c of Object.values(props.countryCounts)) {
    if (c > 0) count++
  }
  return count
})

function getSelectedCountryCount(): number {
  if (!props.selectedCountry) return 0
  for (const [code, count] of Object.entries(props.countryCounts)) {
    if (getCountryName(code) === props.selectedCountry) {
      return count
    }
  }
  return 0
}

const activeInfo = computed(() => {
  if (hoveredCountry.value) {
    return hoveredCountry.value
  }
  if (props.selectedCountry) {
    return {
      code: '',
      name: props.selectedCountry,
      count: getSelectedCountryCount(),
    }
  }
  return null
})

const mapAriaLabel = computed(() => {
  const count = totalMappedCountries.value
  return `Mapa de leituras por país. ${count} ${count === 1 ? 'país com livros registrados' : 'países com livros registrados'}.`
})

const unmappedNote = computed(() => {
  const unmapped = props.unmappedCountries
  if (!unmapped || unmapped.length === 0) return ''
  const list = unmapped.join(', ')
  return unmapped.length === 1
    ? `* Há 1 país com leituras sem representação geográfica no mapa (${list}).`
    : `* Há ${unmapped.length} países com leituras sem representação geográfica no mapa (${list}).`
})

function onCountryHover(isoCode: string) {
  const count = getCount(isoCode)
  if (count > 0) {
    hoveredCountry.value = {
      code: isoCode,
      name: getCountryName(isoCode),
      count,
    }
  }
}

function onCountryLeave() {
  hoveredCountry.value = null
}

function onCountryClick(isoCode: string) {
  const count = getCount(isoCode)
  if (count <= 0) return
  const name = getCountryName(isoCode)
  if (!name) return
  const next = props.selectedCountry === name ? '' : name
  emit('select', next)
}

function clearSelection() {
  emit('select', '')
}
</script>

<style scoped>
.reading-map-card {
  background-color: var(--card-bg, #232a31);
  border: 1px solid var(--input-bg, #2c3440);
  border-radius: var(--radius-md, 8px);
  padding: var(--space-4, 16px);
  margin-bottom: var(--space-6, 24px);
  box-sizing: border-box;
}

.map-header {
  margin-bottom: var(--space-3, 12px);
}

.map-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2, 8px);
}

.map-title {
  font-size: var(--font-size-base, 1rem);
  font-weight: 600;
  color: #fff;
  margin: 0;
  line-height: var(--line-height-tight, 1.2);
}

.map-status {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  font-size: var(--font-size-sm, 0.875rem);
}

.country-name {
  color: #fff;
  font-weight: 600;
}

.country-count {
  color: var(--highlight, #40bcf4);
}

.map-summary {
  color: var(--text-color, #9ab);
  font-size: var(--font-size-sm, 0.875rem);
}

.clear-filter-btn {
  background: none;
  border: 1px solid var(--text-color, #9ab);
  color: var(--text-color, #9ab);
  padding: 2px var(--space-2, 8px);
  min-height: 28px;
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  font-size: var(--font-size-xs, 0.75rem);
  font-family: inherit;
  transition: border-color 0.2s, color 0.2s;
}

.clear-filter-btn:hover {
  border-color: #fff;
  color: #fff;
}

.clear-filter-btn:focus-visible {
  outline: var(--focus-ring-width, 2px) solid var(--focus-ring-color, #40bcf4);
  outline-offset: var(--focus-ring-offset, 2px);
}

.map-svg-wrapper {
  width: 100%;
  overflow: hidden;
  border-radius: var(--radius-sm, 4px);
  background-color: var(--bg-color, #14181c);
  display: flex;
  justify-content: center;
  align-items: center;
}

.world-map-svg {
  width: 100%;
  height: auto;
  display: block;
  max-height: 480px;
}

.country-group path {
  stroke: var(--card-bg, #232a31);
  stroke-width: 0.6px;
  stroke-linejoin: round;
  transition: fill 0.15s ease, opacity 0.15s ease;
}

.tier-0 path {
  fill: var(--input-bg, #2c3440);
}

.tier-1 path {
  fill: color-mix(in srgb, var(--star-color, #0083e0) 40%, var(--card-bg, #232a31));
}

.tier-2 path {
  fill: color-mix(in srgb, var(--star-color, #0083e0) 75%, var(--card-bg, #232a31));
}

.tier-3 path {
  fill: var(--star-color, #0083e0);
}

.tier-4 path {
  fill: var(--highlight, #40bcf4);
}

.has-books {
  cursor: pointer;
}

.has-books:hover path {
  stroke: var(--poster-border, #fff);
  stroke-width: 1.2px;
}

.is-selected path {
  fill: var(--highlight, #40bcf4);
  stroke: var(--poster-border, #fff);
  stroke-width: 1.8px;
}

.is-dimmed {
  opacity: 0.35;
}

.unmapped-note {
  margin: var(--space-2, 8px) 0 0 0;
  font-size: var(--font-size-xs, 0.75rem);
  color: var(--text-color, #9ab);
  line-height: var(--line-height-normal, 1.5);
}

@media (max-width: 640px) {
  .reading-map-card {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .country-group path,
  .clear-filter-btn {
    transition: none;
  }
}
</style>
