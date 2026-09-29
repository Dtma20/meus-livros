<template>
  <div class="filter-bar">
    <div class="filter-container">
      <div class="filter-row">
        <div class="filter-group">
          <select
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

          <select
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

          <select
            :value="decade"
            aria-label="Filtrar por década"
            class="filter-select"
            @change="$emit('update:decade', ($event.target as HTMLSelectElement).value)"
          >
            <option value="">Todas as décadas</option>
            <option v-for="d in availableDecades" :key="d" :value="d">
              Anos {{ d }}
            </option>
          </select>
        </div>

        <div class="filter-group">
          <span class="sort-label">Ordenar:</span>
          <select
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

          <button
            v-if="hasActiveFilters"
            type="button"
            class="reset-btn"
            aria-label="Limpar todos os filtros"
            @click="$emit('reset')"
          >
            Limpar &times;
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  genre: string
  country: string
  decade: string | number
  sortBy: string
  availableGenres: string[]
  availableCountries: string[]
  availableDecades: number[]
  hasActiveFilters: boolean
}>()

defineEmits<{
  (e: 'update:genre' | 'update:country' | 'update:sortBy', value: string): void
  (e: 'update:decade', value: string | number): void
  (e: 'reset'): void
}>()
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
  align-items: center;
}

.filter-row {
  justify-content: space-between;
}

.sort-label {
  color: var(--text-color, #9ab);
  font-size: var(--font-size-sm, 0.875rem);
}

.filter-select {
  background-color: var(--input-bg, #2c3440);
  color: var(--text-bright);
  border: 1px solid transparent;
  padding: 8px 12px;
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  font-size: var(--font-size-sm, 0.875rem);
  font-family: inherit;
}

.filter-select:focus-visible {
  outline: var(--focus-ring-width, 2px) solid var(--focus-ring-color, #f59e0b);
  outline-offset: var(--focus-ring-offset, 2px);
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
  .filter-row,
  .filter-group {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
  }
  .filter-group {
    display: contents;
  }
  .sort-label {
    display: none;
  }
  .filter-select {
    width: 100%;
    min-width: 0;
    min-height: var(--target-min-size);
    box-sizing: border-box;
  }
  .reset-btn {
    grid-column: 1 / -1;
    justify-self: start;
    min-height: var(--target-min-size);
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
