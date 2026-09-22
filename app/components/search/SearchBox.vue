<template>
  <div class="search-box" role="search">
    <div class="search-input-wrap">
      <label :for="inputId" class="sr-only">Buscar livros</label>
      <input
        :id="inputId"
        ref="inputRef"
        v-model="query"
        type="search"
        class="search-input"
        placeholder="Buscar livros…"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        aria-autocomplete="list"
        :aria-expanded="isOpen"
        :aria-controls="listId"
        :aria-activedescendant="activeItemId"
        @keydown="onKeydown"
        @focus="onFocus"
        @blur="onBlur"
      >
      <span v-if="loading" class="search-spinner" aria-hidden="true" />
    </div>

    <!-- Results dropdown -->
    <ul
      v-if="isOpen"
      :id="listId"
      ref="listRef"
      class="search-results"
      :role="results.length > 0 ? 'listbox' : undefined"
      :aria-label="resultsLabel"
    >
      <!-- Works found -->
      <template v-if="results.length > 0">
        <li
          v-for="(work, index) in results"
          :id="itemId(index)"
          :key="work.id || work.ol_work_key || index"
          class="search-result"
          :class="{ 'is-active': index === activeIndex, 'is-external': work.source === 'externo' }"
          role="option"
          :aria-selected="index === activeIndex"
          @mousedown.prevent="selectWork(work)"
          @mouseover="activeIndex = index"
        >
          <div class="result-cover">
            <BookCover
              :title="work.title"
              :cover-url="work.cover_url"
              :ol-cover-id="work.ol_cover_id"
              :alt="`Capa de ${work.title}`"
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
          <span
            class="result-badge"
            :class="work.source === 'externo' ? 'badge-external' : 'badge-local'"
          >
            {{ work.source === 'externo' ? 'Open Library' : 'No acervo' }}
          </span>
        </li>
      </template>

      <!-- Zero results: invitation to add, not a failure message -->
      <li
        v-else-if="!loading && searched"
        class="search-empty"
      >
        <span class="empty-headline">Não encontramos esse livro.</span>
        <div class="empty-actions">
          <button
            type="button"
            class="empty-btn-primary"
            data-testid="search-add-manual"
            @click="goToAdd('manual')"
          >
            Adicionar à mão
          </button>
          <button
            type="button"
            class="empty-btn-secondary"
            data-testid="search-online-lookup"
            @click="goToAdd('online')"
          >
            Buscar online
          </button>
        </div>
      </li>
    </ul>
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
  }>(),
  {
    initialQuery: '',
    navigateOnSelect: true,
  },
)

const emit = defineEmits<{
  (e: 'select', work: SearchResult): void
}>()

// ---------------------------------------------------------------------------
// IDs — unique per instance so multiple SearchBoxes on the same page work.
// useId() (not Math.random()) so server and client render the same value.
// ---------------------------------------------------------------------------
const uid = useId().replace(/:/g, '')
const inputId = `search-input-${uid}`
const listId = `search-list-${uid}`
const itemId = (i: number) => `search-item-${uid}-${i}`

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const query = ref(props.initialQuery || '')
const results = ref<SearchResult[]>([])
const loading = ref(false)
const activeIndex = ref(-1)
const focused = ref(false)
/** True once we have received at least one response for the current query. */
const searched = ref(false)
/** The query that produced the current results (for the empty-state message). */
const lastQuery = ref('')

const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLUListElement | null>(null)

// ---------------------------------------------------------------------------
// Derived
// ---------------------------------------------------------------------------
const isOpen = computed(
  () => focused.value && query.value.trim().length >= 2 && (results.value.length > 0 || (!loading.value && searched.value)),
)

const activeItemId = computed(() =>
  activeIndex.value >= 0 ? itemId(activeIndex.value) : undefined,
)

const resultsLabel = computed(() =>
  results.value.length
    ? `${results.value.length} resultado${results.value.length > 1 ? 's' : ''}`
    : 'Nenhum resultado',
)

// ---------------------------------------------------------------------------
// Debounced fetch — 250ms, aborts in-flight request on new keystroke
// ---------------------------------------------------------------------------
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let abortController: AbortController | null = null

async function fetchResults(term: string): Promise<void> {
  if (term.length < 2) {
    results.value = []
    searched.value = false
    loading.value = false
    return
  }

  // Abort the previous in-flight request before issuing a new one.
  abortController?.abort()
  abortController = new AbortController()
  const signal = abortController.signal

  loading.value = true

  // Fast path: fetch local catalog first so existing books appear instantaneously (< 50ms)
  fetch(`/api/search?q=${encodeURIComponent(term)}&local=true`, { signal })
    .then(async (res) => {
      if (!res.ok || signal.aborted) return
      const data = (await res.json()) as { works: SearchResult[] }
      if (signal.aborted) return
      // If we got local results and full search hasn't settled yet, show them immediately
      if (data.works && data.works.length > 0 && loading.value) {
        results.value = data.works
        searched.value = true
        lastQuery.value = term
      }
    })
    .catch(() => {})

  // Full path: hybrid search (local prioritized + Open Library complement)
  try {
    const res = await fetch(
      `/api/search?q=${encodeURIComponent(term)}`,
      { signal },
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as { works: SearchResult[] }
    results.value = data.works
    lastQuery.value = term
    searched.value = true
    activeIndex.value = -1
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') return
    if (results.value.length === 0) {
      results.value = []
      searched.value = false
    }
  } finally {
    loading.value = false
  }
}

watch(query, (val) => {
  const trimmed = val.trim()
  searched.value = false

  if (debounceTimer) clearTimeout(debounceTimer)
  if (trimmed.length < 2) {
    abortController?.abort()
    results.value = []
    loading.value = false
    return
  }

  // Show spinner immediately so the UI doesn't feel frozen on slow connections.
  loading.value = true
  debounceTimer = setTimeout(() => fetchResults(trimmed), 250)
})

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
  abortController?.abort()
})

// ---------------------------------------------------------------------------
// Keyboard navigation
// ---------------------------------------------------------------------------
function onKeydown(e: KeyboardEvent): void {
  if (!isOpen.value) return

  const total = results.value.length

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
    } else if (results.value.length === 0 && searched.value) {
      goToAdd('manual')
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

// ---------------------------------------------------------------------------
// Focus / blur
// ---------------------------------------------------------------------------
function onFocus(): void {
  focused.value = true
}

/** Small delay so mousedown on a result fires before the list disappears. */
function onBlur(): void {
  setTimeout(() => {
    const activeEl = typeof document !== 'undefined' ? document.activeElement : null
    if (activeEl && listRef.value?.contains(activeEl)) {
      return
    }
    focused.value = false
    activeIndex.value = -1
  }, 150)
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------
async function selectWork(work: SearchResult): Promise<void> {
  if (work.source === 'externo' && !work.id) {
    loading.value = true
    try {
      const res = await fetch('/api/works/import-external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ol_work_key: work.ol_work_key,
          title: work.title,
          authors: work.authors.map((a) => a.name),
          first_publish_year: work.first_published_year,
          cover_url: work.cover_url,
          ol_cover_id: work.ol_cover_id,
          language: work.language,
        }),
      })
      if (res.ok) {
        const imported = (await res.json()) as { id: string; slug: string; title: string }
        work = { ...work, id: imported.id, slug: imported.slug, source: 'local' }
      } else {
        goToAdd('online')
        return
      }
    } catch {
      goToAdd('online')
      return
    } finally {
      loading.value = false
    }
  }

  emit('select', work)
  if (props.navigateOnSelect && work.slug) {
    void navigateTo(`/livro/${work.slug}`)
  }
}

function goToAdd(mode: 'manual' | 'online' = 'manual'): void {
  const q = query.value.trim()

  let currentPath = ''
  try {
    if (typeof useRoute === 'function') {
      currentPath = useRoute().fullPath || ''
    }
  } catch {
    // In unit test or environment without router context
  }

  const hasRet = currentPath && currentPath !== '/app/livro/novo' && !currentPath.startsWith('/app/livro/novo?')
  const retParam = hasRet ? `&ret=${encodeURIComponent(currentPath)}` : ''
  const onlineParam = mode === 'online' ? '&online=true' : ''
  const dest = q
    ? `/app/livro/novo?q=${encodeURIComponent(q)}${onlineParam}${retParam}`
    : `/app/livro/novo${onlineParam || retParam ? `?${(onlineParam + retParam).replace(/^&/, '')}` : ''}`

  void navigateTo(dest)
}

</script>

<style scoped>
/* Screen-reader-only utility — no Tailwind in this project */
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

/* Input + spinner row */
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
}

.search-input:focus-visible {
  outline: 2px solid var(--highlight);
  outline-offset: 2px;
}

/* Hide the native clear (×) button in WebKit */
.search-input::-webkit-search-cancel-button {
  display: none;
}

/* Loading spinner */
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

/* Results list */
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

/* Individual result */
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

.result-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
  flex-shrink: 0;
}

.badge-local {
  background-color: rgba(59, 130, 246, 0.15);
  color: #93c5fd;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.badge-external {
  background-color: rgba(168, 85, 247, 0.15);
  color: #d8b4fe;
  border: 1px solid rgba(168, 85, 247, 0.3);
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

/* Empty state — looks like a next step, not an error */
.search-empty {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  cursor: default;
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background-color: var(--highlight);
  color: #000;
  font-weight: 700;
  font-size: var(--font-size-xs);
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  border: none;
  cursor: pointer;
  transition: opacity 0.2s;
}

.empty-btn-primary:hover {
  opacity: 0.9;
}

.empty-btn-primary:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 1px;
}

.empty-btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background-color: transparent;
  color: var(--highlight);
  font-size: var(--font-size-xs);
  font-weight: 500;
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--input-bg);
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s;
}

.empty-btn-secondary:hover {
  border-color: var(--highlight);
  background-color: var(--input-bg);
}

.empty-btn-secondary:focus-visible {
  outline: 2px solid var(--highlight);
  outline-offset: 1px;
}

@media (prefers-reduced-motion: reduce) {
  .search-spinner {
    animation-duration: 1.5s;
  }
  .search-input,
  .search-result,
  .empty-btn-primary,
  .empty-btn-secondary {
    transition: none;
  }
}
</style>
