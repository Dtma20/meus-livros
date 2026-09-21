<template>
  <div class="external-lookup">
    <div class="lookup-bar">
      <div class="lookup-input-wrap">
        <label for="external-lookup-input" class="sr-only">Buscar no Open Library</label>
        <input
          id="external-lookup-input"
          v-model="searchTerm"
          type="text"
          class="form-input lookup-input"
          placeholder="Buscar no Open Library por título ou autor..."
          :disabled="loading || disabled"
          @keydown.enter.prevent="performLookup"
        >
      </div>

      <button
        type="button"
        class="btn btn-secondary btn-lookup"
        :disabled="loading || disabled || !searchTerm.trim()"
        @click="performLookup"
      >
        <span v-if="loading" class="spinner" aria-hidden="true" />
        <span>{{ loading ? 'Consultando o Open Library…' : 'Buscar dados online' }}</span>
      </button>
    </div>

    <!-- Loading message -->
    <div v-if="loading" class="lookup-status" role="status">
      Consultando o Open Library…
    </div>

    <!-- Unavailable message -->
    <div
      v-else-if="hasSearched && unavailable"
      class="lookup-message lookup-empty"
      role="status"
    >
      {{ customErrorMessage || 'Não conseguimos buscar online agora. Você pode preencher à mão.' }}
    </div>

    <!-- Zero results message -->
    <div
      v-else-if="hasSearched && results.length === 0"
      class="lookup-message lookup-empty"
      role="status"
    >
      Nenhum resultado encontrado no Open Library. Você pode preencher os dados à mão.
    </div>

    <!-- Results list -->
    <div v-else-if="results.length > 0" class="lookup-results" role="region" aria-label="Resultados do Open Library">
      <div class="lookup-results-header">
        <span class="results-count">
          {{ results.length }} {{ results.length === 1 ? 'resultado encontrado' : 'resultados encontrados' }} no Open Library:
        </span>
        <button
          type="button"
          class="btn-close-results"
          aria-label="Fechar resultados da busca online"
          @click="clearResults"
        >
          Fechar ×
        </button>
      </div>

      <ul class="results-list">
        <li
          v-for="book in results"
          :key="book.ol_work_key"
          class="result-item"
        >
          <div class="result-cover">
            <BookCover
              :title="book.title"
              :cover-url="book.cover_url"
              :ol-cover-id="book.ol_cover_id"
              :alt="getAuthorsDisplay(book) ? `Capa de ${book.title}, de ${getAuthorsDisplay(book)}` : `Capa de ${book.title}`"
            />
          </div>

          <div class="result-info">
            <h4 class="result-title">{{ book.title }}</h4>
            <p v-if="getAuthorsDisplay(book)" class="result-authors">
              {{ getAuthorsDisplay(book) }}
            </p>
            <p v-if="book.first_publish_year" class="result-year">
              1ª publicação: {{ book.first_publish_year }}
            </p>
            <p v-if="book.language" class="result-language">
              Idioma: {{ book.language.toUpperCase() }}
            </p>
          </div>

          <div class="result-actions">
            <button
              type="button"
              class="btn btn-primary btn-select-result"
              @click="selectBook(book)"
            >
              Usar dados
            </button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import BookCover from '../book/BookCover.vue'
import type { ExternalBookResult, ExternalSearchResponse } from '../../../shared/schemas/search'

const props = withDefaults(
  defineProps<{
    query?: string
    disabled?: boolean
    autoLookup?: boolean
  }>(),
  {
    query: '',
    disabled: false,
    autoLookup: false,
  },
)

const emit = defineEmits<{
  (e: 'select', book: ExternalBookResult): void
}>()

const searchTerm = ref(props.query || '')
const loading = ref(false)
const hasSearched = ref(false)
const unavailable = ref(false)
const customErrorMessage = ref('')
const results = ref<ExternalBookResult[]>([])

onMounted(() => {
  if (props.autoLookup && searchTerm.value.trim().length >= 2) {
    void performLookup()
  }
})

// Sync searchTerm when props.query changes, provided the user hasn't typed an explicit query
watch(
  () => props.query,
  (newQuery) => {
    if (!hasSearched.value && !searchTerm.value.trim()) {
      searchTerm.value = newQuery || ''
    }
  },
)

function getAuthorsDisplay(book: ExternalBookResult): string {
  return book.authors?.length ? book.authors.join(', ') : ''
}

async function performLookup(): Promise<void> {
  const q = searchTerm.value.trim()
  if (!q || q.length < 2 || loading.value || props.disabled) {
    return
  }

  loading.value = true
  hasSearched.value = false
  unavailable.value = false
  customErrorMessage.value = ''
  results.value = []

  try {
    const data = await $fetch<ExternalSearchResponse>(
      `/api/search/externo?q=${encodeURIComponent(q)}`,
      {
        // Open Library lookup via /api/search/externo is non-critical enrichment.
        // Capped at 10s to fail gracefully and let users proceed with manual entry.
        timeout: 10_000,
        retry: 0,
      },
    )

    hasSearched.value = true
    if (data.indisponivel) {
      unavailable.value = true
      results.value = []
    } else if (!data.results || data.results.length === 0) {
      unavailable.value = false
      results.value = []
    } else {
      unavailable.value = false
      results.value = data.results
    }
  } catch (err: unknown) {
    hasSearched.value = true
    unavailable.value = true
    const name = (err as { name?: string })?.name
    if (name === 'AbortError' || name === 'TimeoutError') {
      customErrorMessage.value =
        'A conexão demorou demais. Verifique sua internet e tente de novo.'
      return
    }
    const e = err as {
      status?: number
      statusCode?: number
      data?: { error?: string; message?: string }
    }
    const status = e.status ?? e.statusCode

    if (status === 429) {
      customErrorMessage.value =
        e.data?.message ||
        'Você atingiu o limite de buscas externas por hora. Preencha os dados à mão.'
    } else {
      // Degrades gracefully without error page
      customErrorMessage.value =
        'Não conseguimos buscar online agora. Você pode preencher à mão.'
    }
  } finally {
    loading.value = false
  }
}

function selectBook(book: ExternalBookResult): void {
  emit('select', book)
  clearResults()
}

function clearResults(): void {
  results.value = []
  hasSearched.value = false
  unavailable.value = false
  customErrorMessage.value = ''
}
</script>

<style scoped>
.external-lookup {
  background-color: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  margin-bottom: var(--space-6);
}

.lookup-bar {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

@media (max-width: 600px) {
  .lookup-bar {
    flex-direction: column;
    align-items: stretch;
  }
}

.lookup-input-wrap {
  flex: 1;
}

.lookup-input {
  background-color: var(--input-bg);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: var(--radius-sm);
  color: #fff;
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-sm);
  width: 100%;
  box-sizing: border-box;
  min-height: 44px;
}

.lookup-input:focus {
  outline: none;
  border-color: var(--highlight);
}

.lookup-input:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-color: var(--highlight);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.btn-lookup {
  min-height: 44px;
  white-space: nowrap;
  padding: 0 var(--space-4);
  font-size: var(--font-size-sm);
}

.btn-lookup:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.lookup-status {
  margin-top: var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--highlight);
  font-style: italic;
}

.lookup-message {
  margin-top: var(--space-3);
  font-size: var(--font-size-sm);
  padding: var(--space-3);
  border-radius: var(--radius-sm);
}

.lookup-empty {
  background-color: rgba(255, 255, 255, 0.05);
  color: var(--text-color);
  border: 1px dashed rgba(255, 255, 255, 0.15);
}

/* Results section */
.lookup-results {
  margin-top: var(--space-4);
}

.lookup-results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.results-count {
  font-size: var(--font-size-xs);
  color: var(--text-color);
  font-weight: 500;
}

.btn-close-results {
  background: none;
  border: none;
  color: var(--text-color);
  font-size: var(--font-size-xs);
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  border-radius: var(--radius-sm);
  transition: color 0.15s;
}

.btn-close-results:hover {
  color: #fff;
  text-decoration: underline;
}

.btn-close-results:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.results-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.result-item {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  background-color: var(--card-bg);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-sm);
  padding: var(--space-3);
  transition: border-color 0.15s;
}

.result-item:hover {
  border-color: rgba(255, 255, 255, 0.2);
}

@media (max-width: 500px) {
  .result-item {
    flex-direction: column;
    align-items: flex-start;
  }

  .result-actions {
    width: 100%;
    margin-top: var(--space-2);
  }

  .btn-select-result {
    width: 100%;
  }
}

.result-cover {
  width: 48px;
  height: 72px;
  flex-shrink: 0;
  border-radius: 2px;
  overflow: hidden;
}

.result-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.result-title {
  margin: 0;
  color: #fff;
  font-size: var(--font-size-sm);
  font-weight: 600;
  line-height: var(--line-height-tight);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-authors {
  margin: 0;
  color: var(--text-color);
  font-size: var(--font-size-xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-year,
.result-language {
  margin: 0;
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
}

.btn-select-result {
  min-height: 44px;
  padding: 0 var(--space-3);
  font-size: var(--font-size-xs);
  white-space: nowrap;
}

.btn-select-result:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
  .btn-close-results,
  .result-item {
    transition: none;
  }
}
</style>
