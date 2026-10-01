<template>
  <div class="search-box" role="search" :aria-label="landmarkLabel">
    <div class="search-input-wrap">
      <label :for="inputId" class="sr-only">Buscar livros</label>
      <input
        :id="inputId"
        ref="inputRef"
        v-model="query"
        type="search"
        role="combobox"
        class="search-input"
        :placeholder="placeholder"
        :aria-keyshortcuts="characterKeyShortcutsEnabled && keyShortcut ? keyShortcut : undefined"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        aria-autocomplete="list"
        :aria-expanded="hasResultList"
        :aria-controls="hasResultList ? listId : undefined"
        :aria-activedescendant="hasResultList ? activeItemId : undefined"
        @keydown="onKeydown"
        @focus="onFocus"
        @blur="onBlur"
      >
      <span v-if="loading" class="search-spinner" aria-hidden="true" />
    </div>

    <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ announcement }}</div>

    <ul
      v-if="hasResultList"
      :id="listId"
      ref="listRef"
      class="search-results"
      role="listbox"
      :aria-label="resultsLabel"
    >
      <li
        v-for="(work, index) in results"
        :id="itemId(index)"
        :key="work.id || index"
        class="search-result"
        :class="{ 'is-active': index === activeIndex }"
        role="option"
        :aria-selected="index === activeIndex"
        @mousedown.prevent="selectWork(work)"
        @mouseover="activeIndex = index"
      >
        <div class="result-cover">
          <BookCover
            :title="work.title"
            :cover-url="work.cover_url"
            :alt="`Capa de ${work.title}`"
            size="small"
            loading="lazy"
          />
        </div>
        <div class="result-content">
          <span class="result-title">{{ work.title }}</span>
          <span v-if="work.authors.length" class="result-author">
            {{ work.authors.map((a) => a.name).join(', ') }}
          </span>
          <span v-if="work.first_published_year" class="result-year">
            {{ work.first_published_year }}
          </span>
        </div>
      </li>
      <li
        :id="itemId(results.length)"
        class="search-result search-add-option"
        :class="{ 'is-active': activeIndex === results.length }"
        role="option"
        :aria-selected="activeIndex === results.length"
        data-testid="search-add-option"
        @mousedown.prevent="goToAdd()"
        @mouseover="activeIndex = results.length"
      >
        <span class="add-option-hint">Não é nenhum destes?</span>{{ ' ' }}<span class="add-option-action">Adicionar livro novo</span>
      </li>
    </ul>

    <div
      v-else-if="isOpen && !loading && searched"
      ref="messagePanelRef"
      class="search-panel search-empty"
    >
      <span class="empty-headline">Não encontramos esse livro.</span>
      <div class="empty-actions">
        <button
          type="button"
          class="btn btn-primary btn-sm empty-btn-primary"
          data-testid="search-add-manual"
          @click="goToAdd()"
        >
          Adicionar livro novo
        </button>
      </div>
    </div>
    <div
      v-else-if="isOpen && !loading && searchError"
      ref="messagePanelRef"
      class="search-panel search-error"
    >
      <p role="alert">{{ searchError }}</p>
      <button type="button" class="btn btn-secondary btn-sm search-retry" @click="retrySearch">
        Tentar novamente
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import BookCover from '../book/BookCover.vue'
import type { SearchResult } from '../../../shared/schemas/search'

const props = withDefaults(
  defineProps<{
    initialQuery?: string
    navigateOnSelect?: boolean
    landmarkLabel?: string
    placeholder?: string
    keyShortcut?: string
    characterKeyShortcutsEnabled?: boolean
  }>(),
  {
    initialQuery: '',
    navigateOnSelect: true,
    landmarkLabel: 'Buscar livros',
    placeholder: 'Buscar livros…',
    keyShortcut: '',
    characterKeyShortcutsEnabled: true,
  },
)

const emit = defineEmits<{
  (e: 'select', work: SearchResult): void
}>()

const uid = useId().replace(/:/g, '')
const inputId = `search-input-${uid}`
const listId = `search-list-${uid}`
const itemId = (i: number) => `search-item-${uid}-${i}`

const query = ref(props.initialQuery || '')
const results = ref<SearchResult[]>([])
const loading = ref(false)
const searchError = ref('')
const activeIndex = ref(-1)
const focused = ref(false)
const searched = ref(false)

const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLUListElement | null>(null)
const messagePanelRef = ref<HTMLDivElement | null>(null)

const isOpen = computed(
  () => focused.value && query.value.trim().length >= 2 && (results.value.length > 0 || (!loading.value && (searched.value || Boolean(searchError.value)))),
)
const hasResultList = computed(() => isOpen.value && results.value.length > 0)

const activeItemId = computed(() =>
  activeIndex.value >= 0 ? itemId(activeIndex.value) : undefined,
)

const resultsLabel = computed(() =>
  results.value.length
    ? `${results.value.length} resultado${results.value.length > 1 ? 's' : ''}`
    : 'Nenhum resultado',
)

const announcement = ref('')
let announceTimer: ReturnType<typeof setTimeout> | null = null

function announce(text: string): void {
  if (announceTimer) clearTimeout(announceTimer)
  announceTimer = setTimeout(() => {
    announcement.value = text
  }, 250)
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let blurTimer: ReturnType<typeof setTimeout> | null = null
let abortController: AbortController | null = null
let searchGeneration = 0

async function fetchResults(term: string, generation: number): Promise<void> {
  if (generation !== searchGeneration || term.length < 2) return
  abortController?.abort()
  const controller = new AbortController()
  abortController = controller

  loading.value = true
  searchError.value = ''

  try {
    const res = await fetch(
      `/api/search?q=${encodeURIComponent(term)}`,
      { signal: controller.signal },
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as { works: SearchResult[] }
    if (generation !== searchGeneration || controller.signal.aborted || term !== query.value.trim()) return
    results.value = data.works
    searched.value = true
    searchError.value = ''
    const n = data.works.length
    announce(
      n === 0
        ? `Nenhum livro encontrado para “${term}”. Você pode adicionar como livro novo.`
        : `${n} ${n === 1 ? 'resultado' : 'resultados'}, ou adicione um livro novo`,
    )
    activeIndex.value = -1
  } catch {
    if (controller.signal.aborted || generation !== searchGeneration || term !== query.value.trim()) return
    results.value = []
    searched.value = false
    activeIndex.value = -1
    searchError.value = 'Não foi possível buscar livros agora.'
  } finally {
    if (generation === searchGeneration && abortController === controller) {
      loading.value = false
      abortController = null
    }
  }
}

watch(query, (val) => {
  const trimmed = val.trim()
  const generation = ++searchGeneration
  searched.value = false

  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = null
  abortController?.abort()
  abortController = null
  results.value = []
  searchError.value = ''
  activeIndex.value = -1
  if (announceTimer) clearTimeout(announceTimer)
  announceTimer = null
  announcement.value = ''

  if (trimmed.length < 2) {
    loading.value = false
    return
  }

  loading.value = true
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void fetchResults(trimmed, generation)
  }, 250)
}, { flush: 'sync' })

onBeforeUnmount(() => {
  searchGeneration++
  if (debounceTimer) clearTimeout(debounceTimer)
  if (blurTimer) clearTimeout(blurTimer)
  if (announceTimer) clearTimeout(announceTimer)
  abortController?.abort()
})

function onKeydown(e: KeyboardEvent): void {
  if (!isOpen.value) return

  const total = results.value.length > 0 ? results.value.length + 1 : 0

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = total > 0 ? Math.min(activeIndex.value + 1, total - 1) : -1
    scrollActiveIntoView()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = total > 0 ? Math.max(activeIndex.value - 1, 0) : -1
    scrollActiveIntoView()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (activeIndex.value >= 0 && results.value[activeIndex.value]) {
      selectWork(results.value[activeIndex.value]!)
    } else if (activeIndex.value === results.value.length && results.value.length > 0) {
      goToAdd()
    } else if (results.value.length === 0 && searched.value) {
      goToAdd()
    }
  } else if (e.key === 'Escape') {
    inputRef.value?.blur()
  }
}

function scrollActiveIntoView(): void {
  nextTick(() => {
    const list = listRef.value
    if (!list) return
    const active = list.querySelector('.is-active') as HTMLElement | null
    active?.scrollIntoView({ block: 'nearest' })
  })
}

function onFocus(): void {
  if (blurTimer) clearTimeout(blurTimer)
  blurTimer = null
  focused.value = true
}

function onBlur(): void {
  if (blurTimer) clearTimeout(blurTimer)
  blurTimer = setTimeout(() => {
    blurTimer = null
    const activeEl = typeof document !== 'undefined' ? document.activeElement : null
    if (activeEl && (listRef.value?.contains(activeEl) || messagePanelRef.value?.contains(activeEl))) {
      return
    }
    focused.value = false
    activeIndex.value = -1
  }, 150)
}

function selectWork(work: SearchResult): void {
  emit('select', work)
  if (props.navigateOnSelect && work.slug) {
    void navigateTo(`/livro/${work.slug}`)
  }
}

function reset(): void {
  searchGeneration++
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = null
  if (blurTimer) clearTimeout(blurTimer)
  blurTimer = null
  if (announceTimer) clearTimeout(announceTimer)
  announceTimer = null
  abortController?.abort()
  abortController = null
  query.value = ''
  results.value = []
  searched.value = false
  searchError.value = ''
  loading.value = false
  announcement.value = ''
  activeIndex.value = -1
  focused.value = typeof document !== 'undefined' && document.activeElement === inputRef.value
}

defineExpose({ reset })

function goToAdd(): void {
  const q = query.value.trim()

  let currentPath = ''
  try {
    if (typeof useRoute === 'function') {
      currentPath = useRoute().fullPath || ''
    }
  } catch {
  }

  const hasRet = currentPath && currentPath !== '/app/livro/novo' && !currentPath.startsWith('/app/livro/novo?')
  const retParam = hasRet ? `&ret=${encodeURIComponent(currentPath)}` : ''
  const dest = q
    ? `/app/livro/novo?q=${encodeURIComponent(q)}${retParam}`
    : `/app/livro/novo${retParam ? `?${retParam.replace(/^&/, '')}` : ''}`

  void navigateTo(dest)
}

function retrySearch(): void {
  const term = query.value.trim()
  if (term.length < 2) return
  inputRef.value?.focus()
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = null
  abortController?.abort()
  abortController = null
  const generation = ++searchGeneration
  results.value = []
  searched.value = false
  searchError.value = ''
  activeIndex.value = -1
  loading.value = true
  void fetchResults(term, generation)
}

</script>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

.search-box {
  position: relative;
  width: 100%;
  max-width: 480px;
}

.search-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.search-input {
  width: 100%;
  background: var(--input-bg);
  color: var(--text-color);
  border: 1px solid var(--input-bg);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  min-height: var(--target-min-size);
  font-size: var(--font-size-base);
  font-family: var(--font-sans);
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}

.search-input::placeholder {
  color: var(--text-color);
  opacity: 0.6;
}

.search-input:focus {
  border-color: var(--highlight);
  box-shadow: 0 0 0 2px var(--highlight-glow);
}

.search-input:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.search-input::-webkit-search-cancel-button {
  display: none;
}

.search-spinner {
  position: absolute;
  right: var(--space-3);
  width: 16px;
  height: 16px;
  border: 2px solid transparent;
  border-top-color: var(--highlight);
  border-radius: var(--radius-full);
  animation: spin 0.6s linear infinite;
  flex-shrink: 0;
  pointer-events: none;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.search-results {
  position: absolute;
  top: calc(100% + var(--space-1));
  left: 0;
  right: 0;
  background: var(--card-bg);
  border: 1px solid var(--input-bg);
  border-radius: var(--radius-md);
  list-style: none;
  margin: 0;
  padding: var(--space-1) 0;
  z-index: 200;
  max-height: 360px;
  overflow-y: auto;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.search-panel {
  position: absolute;
  top: calc(100% + var(--space-1));
  left: 0;
  right: 0;
  z-index: 200;
  background: var(--card-bg);
  border: 1px solid var(--input-bg);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.search-result {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  border-radius: 0;
  transition: background 0.1s;
}

.search-result:hover,
.search-result.is-active {
  background: var(--input-bg);
}

.result-cover {
  width: 32px;
  height: 48px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background-color: var(--input-bg);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}

.result-cover :deep(img),
.result-cover :deep(.book-cover) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.result-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.result-title {
  color: #fff;
  font-size: var(--font-size-sm);
  font-weight: 500;
  line-height: var(--line-height-tight);
}

.result-author {
  color: var(--text-color);
  font-size: var(--font-size-xs);
}

.result-year {
  color: var(--text-color);
  font-size: var(--font-size-xs);
  opacity: 0.7;
}

.search-add-option {
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-2);
  border-top: 1px solid var(--input-bg);
  margin-top: var(--space-1);
  font-size: var(--font-size-sm);
}

.add-option-hint {
  color: var(--text-color);
}

.add-option-action {
  color: var(--highlight);
  font-weight: 600;
}

.search-empty {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  cursor: default;
}

.search-error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3);
  color: var(--danger-text);
}

.search-error p {
  margin: 0;
}

.empty-headline {
  color: var(--text-color);
  font-size: var(--font-size-sm);
}

.empty-actions {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  flex-wrap: wrap;
}

.empty-btn-primary {
  min-height: var(--target-min-size);
}

.search-retry {
  min-height: var(--target-min-size);
}

@media (prefers-reduced-motion: reduce) {
  .search-spinner {
    animation-duration: 1.5s;
  }
  .search-input,
  .search-result,
  .empty-btn-primary {
    transition: none;
  }
}
</style>
