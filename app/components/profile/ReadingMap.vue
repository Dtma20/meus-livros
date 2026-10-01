<template>
  <details class="reading-map-card" :open="isOpen" @toggle="onToggle">
    <summary class="map-summary-row">
      <h2 class="map-title">Mapa de leituras</h2>
      <span class="map-count"><span aria-hidden="true">&middot;&nbsp;</span>{{ countrySummary }}</span>
      <span v-if="selectedCountry" class="map-filtering">&middot; filtrando: {{ selectedCountry }}</span>
    </summary>

    <div class="map-header">
      <p class="map-hint">
        <span class="hint-pointer">Clique num país para filtrar os livros, ou use o filtro País.</span>
        <span class="hint-touch">Toque num país para filtrar os livros, ou use o filtro País.</span>
      </p>
      <div class="map-title-row">
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
        </div>
      </div>
    </div>

    <div class="map-svg-wrapper">
      <svg
        :viewBox="WORLD_MAP_VIEW_BOX"
        preserveAspectRatio="xMidYMid meet"
        class="world-map-svg"
        role="img"
        :aria-label="mapAriaLabel"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g
          v-for="(paths, isoCode) in WORLD_MAP_PATHS"
          :key="isoCode"
          v-memo="[groupClasses[isoCode]]"
          :class="groupClasses[isoCode]"
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
  </details>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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

const MAP_OPEN_KEY = 'ml:reading-map-open'
const isOpen = ref(false)

onMounted(() => {
  try {
    isOpen.value = window.localStorage.getItem(MAP_OPEN_KEY) === '1'
  }
  catch {
  }
})

function onToggle(e: Event): void {
  const open = (e.target as HTMLDetailsElement).open
  isOpen.value = open
  try {
    window.localStorage.setItem(MAP_OPEN_KEY, open ? '1' : '0')
  }
  catch {
  }
}

const hoveredCountry = ref<{ code: string; name: string; count: number } | null>(null)

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

const groupClasses = computed<Record<string, string[]>>(() => {
  const max = maxCount.value
  const selected = props.selectedCountry
  const out: Record<string, string[]> = {}
  for (const isoCode of Object.keys(WORLD_MAP_PATHS)) {
    const count = getCount(isoCode)
    const isSelected = Boolean(selected) && getCountryName(isoCode) === selected
    const classes = ['country-group', `tier-${getMapColorTier(count, max)}`]
    if (count > 0) classes.push('has-books')
    if (isSelected) classes.push('is-selected')
    else if (selected) classes.push('is-dimmed')
    out[isoCode] = classes
  }
  return out
})

function isSelectedName(name: string): boolean {
  if (!props.selectedCountry) return false
  return props.selectedCountry === name
}

const totalMappedCountries = computed(() => {
  let count = 0
  for (const c of Object.values(props.countryCounts)) {
    if (c > 0) count++
  }
  return count
})

const totalCountries = computed(() => totalMappedCountries.value + props.unmappedCountries.length)

const countrySummary = computed(() => {
  const total = totalCountries.value
  const outside = props.unmappedCountries.length
  const base = `${total} ${total === 1 ? 'país' : 'países'} no total`
  return outside > 0 ? `${base} (${outside} fora do mapa)` : base
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

.reading-map-card:not([open]) {
  padding-block: var(--space-2, 8px);
}

.map-summary-row {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0 var(--space-2, 8px);
  cursor: pointer;
  min-height: 36px;
  align-items: center;
  border-radius: var(--radius-sm, 4px);
}

.map-summary-row:focus-visible {
  outline: var(--focus-ring-width, 2px) solid var(--focus-ring-color, #f59e0b);
  outline-offset: var(--focus-ring-offset, 2px);
}

.map-summary-row {
  list-style: none;
}

.map-summary-row::-webkit-details-marker {
  display: none;
}

.map-summary-row::after {
  content: '';
  margin-left: auto;
  width: 0.5em;
  height: 0.5em;
  border-right: 2px solid var(--text-color, #9ab);
  border-bottom: 2px solid var(--text-color, #9ab);
  transform: rotate(45deg);
}

.reading-map-card[open] .map-summary-row::after {
  transform: rotate(-135deg);
}

.map-count {
  color: var(--text-color, #9ab);
  font-size: var(--font-size-sm, 0.875rem);
  white-space: nowrap;
}

.map-filtering {
  color: var(--text-bright, #fff);
  font-size: var(--font-size-sm, 0.875rem);
  font-weight: 600;
}

.map-header {
  margin: var(--space-3, 12px) 0;
}

.hint-touch {
  display: inline;
}

.hint-pointer {
  display: none;
}

@media (hover: hover) and (pointer: fine) {
  .hint-touch {
    display: none;
  }

  .hint-pointer {
    display: inline;
  }
}

.map-title-row {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2, 8px);
}

.map-title {
  font-size: var(--font-size-base, 1rem);
  font-weight: 600;
  color: var(--text-bright, #fff);
  margin: 0;
  line-height: var(--line-height-tight, 1.2);
}

.map-hint {
  margin: 0 0 var(--space-1, 4px);
  font-size: var(--font-size-xs, 0.75rem);
  color: var(--text-color, #9ab);
}

.map-status {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  min-height: 28px;
  font-size: var(--font-size-sm, 0.875rem);
}

.country-name {
  color: #fff;
  font-weight: 600;
}

.country-count {
  color: var(--highlight, #f59e0b);
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
  outline: var(--focus-ring-width, 2px) solid var(--focus-ring-color, #f59e0b);
  outline-offset: var(--focus-ring-offset, 2px);
}

.world-map-svg {
  width: 100%;
  height: auto;
  max-height: 280px;
  display: block;
  margin: 0 auto;
}

.tier-0 path {
  fill: var(--input-bg, #2c3440);
}

.tier-1 path {
  fill: color-mix(in srgb, var(--star-color, #f59e0b) 40%, var(--card-bg, #232a31));
}

.tier-2 path {
  fill: color-mix(in srgb, var(--star-color, #f59e0b) 75%, var(--card-bg, #232a31));
}

.tier-3 path {
  fill: var(--star-color, #f59e0b);
}

.tier-4 path {
  fill: var(--highlight, #fbbf24);
}

.has-books {
  cursor: pointer;
}

.has-books:hover path {
  stroke: var(--poster-border, #fff);
  stroke-width: 1.2px;
}

.is-selected path {
  fill: var(--highlight, #f59e0b);
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

@media (pointer: coarse) {
  .clear-filter-btn {
    min-height: var(--target-min-size, 44px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .country-group path,
  .clear-filter-btn {
    transition: none;
  }
}
</style>
