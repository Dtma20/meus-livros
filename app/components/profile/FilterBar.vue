<template>
  <div class="filter-bar">
    <button
      type="button"
      class="filters-toggle"
      aria-controls="filter-row"
      :aria-expanded="panelOpen"
      @click="panelOpen = !panelOpen"
    >
      Filtros<template v-if="activeCount > 0"> &middot; {{ activeCount }}</template>
    </button>
    <div id="filter-row" class="filter-row" :class="{ 'is-open': panelOpen }">
      <div class="filter-group">
        <div class="field">
          <label class="field-label" for="filter-genre">Gênero</label>
          <select
            id="filter-genre"
            :value="genre"
            aria-label="Filtrar por gênero"
            class="filter-select"
            @change="$emit('update:genre', ($event.target as HTMLSelectElement).value)"
          >
            <option value="">Todos os gêneros</option>
            <option v-for="g in availableGenres" :key="g" :value="g">
              {{ g }}
            </option>
          </select>
        </div>

        <div class="field">
          <label class="field-label" for="filter-country">País</label>
          <select
            id="filter-country"
            :value="country"
            aria-label="Filtrar por país"
            class="filter-select"
            @change="$emit('update:country', ($event.target as HTMLSelectElement).value)"
          >
            <option value="">Todos os países</option>
            <option v-for="c in availableCountries" :key="c" :value="c">
              {{ c }}
            </option>
          </select>
        </div>

        <div class="field">
          <label class="field-label" for="filter-decade">Década</label>
          <select
            id="filter-decade"
            :value="decade"
            aria-label="Filtrar por década"
            class="filter-select"
            @change="$emit('update:decade', ($event.target as HTMLSelectElement).value)"
          >
            <option value="">Todas as décadas</option>
            <option v-for="d in availableDecades" :key="d" :value="d">
              {{ decadeLabel(d) }}
            </option>
          </select>
        </div>

        <div class="field sort-field">
          <label class="field-label sort-label" for="filter-sort">Ordenar</label>
          <select
            id="filter-sort"
            :value="sortBy"
            aria-label="Ordenar por"
            class="filter-select sort-select"
            @change="$emit('update:sortBy', ($event.target as HTMLSelectElement).value)"
          >
            <option value="read_desc">Lidos por último</option>
            <option value="read_asc">Lidos primeiro</option>
            <option value="rating">Melhores notas</option>
            <option value="year_desc">Mais novos</option>
            <option value="year_asc">Mais antigos</option>
            <option value="alpha">A-Z</option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="hasActiveFilters" class="filter-status">
      <p
        v-if="shownCount !== undefined && totalCount !== undefined"
        class="filter-summary"
        role="status"
        aria-live="polite"
      >
        Mostrando {{ shownCount.toLocaleString('pt-BR') }} de {{ totalCount.toLocaleString('pt-BR') }}
        {{ totalCount === 1 ? 'livro' : 'livros' }}
      </p>
      <button
        type="button"
        class="reset-btn"
        aria-label="Limpar todos os filtros"
        @click="$emit('reset')"
      >
        Limpar filtros
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  genre: string
  country: string
  decade: string | number
  sortBy: string
  availableGenres: string[]
  availableCountries: string[]
  availableDecades: number[]
  hasActiveFilters: boolean
  shownCount?: number
  totalCount?: number
}>()

const panelOpen = ref(false)
const activeCount = computed(() =>
  [props.genre, props.country, props.decade].filter((v) => v !== '' && v !== null && v !== undefined).length,
)

defineEmits<{
  (e: 'update:genre' | 'update:country' | 'update:sortBy', value: string): void
  (e: 'update:decade', value: string | number): void
  (e: 'reset'): void
}>()

function decadeLabel(decade: number): string {
  if (decade < 0) return `Anos ${Math.abs(decade)} a.C.`
  if (decade < 1000) return `Anos ${decade} d.C.`
  return `Anos ${decade}`
}
</script>

<style scoped>
.filter-bar {
  margin-bottom: var(--space-4, 16px);
  width: 100%;
}

.filter-row,
.filter-group {
  display: flex;
  gap: var(--space-2, 8px) var(--space-3, 12px);
  flex-wrap: wrap;
  align-items: flex-end;
}

.filters-toggle {
  display: none;
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1, 4px);
  min-width: 0;
}

.field-label {
  color: var(--text-color, #9ab);
  font-size: var(--font-size-xs, 0.75rem);
  line-height: var(--line-height-tight, 1.2);
}

.filter-select {
  background-color: var(--input-bg, #2c3440);
  color: var(--text-bright);
  border: 1px solid transparent;
  padding: 8px 12px;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  font-size: var(--font-size-sm, 0.875rem);
  font-family: inherit;
}

.filter-select:focus {
  outline: none;
  border-color: var(--highlight, #f59e0b);
}

.filter-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1, 4px) var(--space-4, 16px);
  margin-top: var(--space-2, 8px);
}

.filter-summary {
  margin: 0;
  color: var(--text-color, #9ab);
  font-size: var(--font-size-sm, 0.875rem);
  font-variant-numeric: tabular-nums;
}

.reset-btn {
  background: none;
  border: none;
  color: var(--text-bright);
  padding: 8px 0;
  cursor: pointer;
  font-size: var(--font-size-sm, 0.875rem);
  font-family: inherit;
  text-decoration: underline;
  text-decoration-color: var(--highlight, #f59e0b);
  text-decoration-thickness: 2px;
  text-underline-offset: 0.3em;
  transition: color 0.2s;
}

.reset-btn:hover {
  color: var(--highlight, #f59e0b);
}

.reset-btn:focus-visible {
  outline: var(--focus-ring-width, 2px) solid var(--focus-ring-color, #f59e0b);
  outline-offset: var(--focus-ring-offset, 2px);
}

@media (pointer: coarse) {
  .filter-select,
  .reset-btn {
    min-height: var(--target-min-size, 44px);
  }
}

@media (max-width: 640px) {
  .filters-toggle {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: var(--target-min-size, 44px);
    padding: 0 var(--space-3, 12px);
    box-sizing: border-box;
    background-color: var(--input-bg, #2c3440);
    color: var(--text-bright);
    border: 1px solid transparent;
    border-radius: var(--radius-sm, 6px);
    font: inherit;
    font-size: var(--font-size-sm, 0.875rem);
    cursor: pointer;
    margin-bottom: var(--space-2, 8px);
  }
  .filters-toggle::after {
    content: '';
    margin-left: auto;
    width: 0.5em;
    height: 0.5em;
    border-right: 2px solid var(--text-color, #9ab);
    border-bottom: 2px solid var(--text-color, #9ab);
    transform: rotate(45deg);
  }
  .filters-toggle[aria-expanded='true']::after {
    transform: rotate(-135deg);
  }
  .filters-toggle:focus-visible {
    outline: var(--focus-ring-width, 2px) solid var(--focus-ring-color, #f59e0b);
    outline-offset: var(--focus-ring-offset, 2px);
  }
  .filter-row:not(.is-open) {
    display: none;
  }
  .filter-row,
  .filter-group {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
  }
  .filter-group {
    display: contents;
  }
  .filter-select {
    width: 100%;
    min-width: 0;
    min-height: var(--target-min-size);
    box-sizing: border-box;
  }
  .filter-status {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 420px) {
  .filter-select {
    font-size: var(--font-size-sm);
    padding-left: var(--space-2);
  }
}

@media (prefers-reduced-motion: reduce) {
  .reset-btn {
    transition: none;
  }
}
</style>
