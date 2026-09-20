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
            <option value="">Todos os Gêneros</option>
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
            <option value="">Todos os Países</option>
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
            <option value="">Todas as Décadas</option>
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
            <option value="read_desc">Lidos Recentemente</option>
            <option value="read_asc">Lidos Antigamente</option>
            <option value="rating">Melhores Notas</option>
            <option value="year_desc">Publicação (Novo)</option>
            <option value="year_asc">Publicação (Velho)</option>
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
  margin-bottom: var(--space-6, 24px);
  width: 100%;
}

.filter-container {
  background-color: #1e2328;
  padding: var(--space-3, 12px) var(--space-4, 16px);
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--input-bg, #2c3440);
  box-sizing: border-box;
}

.filter-row {
  display: flex;
  gap: var(--space-3, 12px);
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
}

.filter-group {
  display: flex;
  gap: var(--space-2, 8px);
  align-items: center;
  flex-wrap: wrap;
}

.sort-label {
  color: var(--text-color, #9ab);
  font-size: var(--font-size-sm, 0.875rem);
}

.filter-select {
  background-color: var(--input-bg, #2c3440);
  color: #fff;
  border: 1px solid #456;
  padding: 8px 12px;
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  font-size: var(--font-size-sm, 0.875rem);
  font-family: inherit;
}

.filter-select:focus {
  outline: none;
  border-color: var(--highlight, #40bcf4);
}

.reset-btn {
  background: none;
  border: 1px solid var(--text-color, #9ab);
  color: var(--text-color, #9ab);
  padding: 8px 12px;
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  font-size: var(--font-size-xs, 0.75rem);
  font-family: inherit;
  transition: border-color 0.2s, color 0.2s;
}

.reset-btn:hover {
  border-color: #fff;
  color: #fff;
}

.reset-btn:focus-visible {
  outline: 2px solid var(--highlight, #40bcf4);
  outline-offset: 2px;
}

@media (max-width: 640px) {
  .filter-container {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .filter-row {
    flex-wrap: nowrap;
    justify-content: flex-start;
    min-width: max-content;
  }
  .filter-group {
    flex-wrap: nowrap;
  }
}
</style>
