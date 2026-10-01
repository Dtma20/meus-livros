<template>
  <div class="author-input">
    <div v-if="authors.length > 0" class="author-tags" role="list" aria-label="Autores adicionados">
      <span
        v-for="(author, index) in authors"
        :key="author.name"
        class="author-tag"
        role="listitem"
      >
        <span class="author-tag-name">{{ author.name }}</span>
        <button
          type="button"
          class="author-tag-remove"
          :aria-label="`Remover autor ${author.name}`"
          :disabled="disabled"
          @click="emit('remove', index)"
        >
          ×
        </button>
      </span>
    </div>

    <div class="author-input-row">
      <div class="author-input-wrap">
        <input
          id="author-input"
          :value="inputValue"
          type="text"
          class="form-input"
          :class="{ 'has-error': error }"
          placeholder="Nome do autor..."
          autocomplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="author-suggestions"
          :aria-required="authors.length === 0"
          :aria-expanded="suggestionsOpen"
          :aria-activedescendant="activeDescendant"
          :disabled="disabled || authors.length >= 5"
          :aria-invalid="Boolean(error)"
          :aria-describedby="error ? 'author-hint author-error' : 'author-hint'"
          @input="onInput"
          @keydown="onKeydown"
          @focus="onFocus"
          @blur="onBlur"
        >

        <ul
          v-show="suggestionsOpen"
          id="author-suggestions"
          class="author-suggestions"
          role="listbox"
          aria-label="Sugestões de autores"
        >
          <li
            v-for="(suggestion, index) in suggestions"
            :id="optionId(index)"
            :key="suggestion"
            class="author-suggestion-item"
            :class="{ 'is-active': index === highlightedIndex }"
            role="option"
            :aria-selected="index === highlightedIndex"
            @pointerdown.prevent="selectSuggestion(suggestion)"
          >
            {{ suggestion }}
          </li>
        </ul>
      </div>

      <button
        type="button"
        class="btn btn-secondary btn-add-author"
        :disabled="disabled || !inputValue.trim() || authors.length >= 5"
        @click="addCurrentInput"
      >
        Adicionar
      </button>
    </div>

    <span v-if="error" id="author-error" class="field-error" role="alert">
      {{ error }}
    </span>
    <span v-else-if="authors.length >= 5" class="field-hint">
      Limite máximo de 5 autores atingido.
    </span>
    <div class="author-sr-only" role="status" aria-live="polite" aria-atomic="true">
      {{ announcement }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { SearchResult } from '~~/shared/schemas/search'

const props = defineProps<{
  authors: Array<{ name: string }>
  inputValue: string
  error?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:inputValue': [value: string]
  add: [name: string]
  remove: [index: number]
}>()

const remoteSuggestions = ref<string[]>([])
const suggestionsOpen = ref(false)
const highlightedIndex = ref(-1)
const announcement = ref('')
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let activeController: AbortController | null = null
let requestSequence = 0
let blurTimer: ReturnType<typeof setTimeout> | null = null

const suggestions = computed(() => remoteSuggestions.value.filter((name) => (
  !props.authors.some((author) => author.name.toLowerCase() === name.toLowerCase())
)).slice(0, 5))
const activeDescendant = computed(() => (
  suggestionsOpen.value && highlightedIndex.value >= 0
    ? optionId(highlightedIndex.value)
    : undefined
))

function optionId(index: number): string {
  return `author-suggestion-${index}`
}

function cancelPendingSearch(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (activeController) {
    activeController.abort()
    activeController = null
  }
  requestSequence += 1
}

function onInput(event: Event): void {
  emit('update:inputValue', (event.target as HTMLInputElement).value)
}

function onFocus(): void {
  if (blurTimer !== null) {
    clearTimeout(blurTimer)
    blurTimer = null
  }
  if (suggestions.value.length > 0) suggestionsOpen.value = true
}

function onBlur(): void {
  if (blurTimer !== null) clearTimeout(blurTimer)
  blurTimer = setTimeout(() => {
    suggestionsOpen.value = false
    highlightedIndex.value = -1
    blurTimer = null
  }, 180)
}

function addAuthor(name: string): void {
  if (props.disabled) return
  const trimmed = name.trim()
  if (!trimmed) return
  if (props.authors.some((author) => author.name.toLowerCase() === trimmed.toLowerCase())) {
    announcement.value = `${trimmed} já está na lista de autores.`
    return
  }
  if (props.authors.length >= 5) {
    announcement.value = 'Limite máximo de 5 autores atingido.'
    return
  }
  emit('add', trimmed)
  emit('update:inputValue', '')
  remoteSuggestions.value = []
  suggestionsOpen.value = false
  highlightedIndex.value = -1
  const message = `${trimmed} adicionado à lista de autores.`
  void nextTick(() => {
    announcement.value = message
  })
}

function addCurrentInput(): void {
  addAuthor(props.inputValue)
}

function selectSuggestion(name: string): void {
  addAuthor(name)
}

function onKeydown(event: KeyboardEvent): void {
  if (props.disabled) return
  if (suggestionsOpen.value && suggestions.value.length > 0) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      highlightedIndex.value = Math.min(highlightedIndex.value + 1, suggestions.value.length - 1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0)
      return
    }
    if (event.key === 'Enter' && highlightedIndex.value >= 0) {
      event.preventDefault()
      const selected = suggestions.value[highlightedIndex.value]
      if (selected) addAuthor(selected)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      suggestionsOpen.value = false
      highlightedIndex.value = -1
      return
    }
  }

  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault()
    addCurrentInput()
  }
}

watch(
  [
    () => props.inputValue,
    () => props.disabled,
    () => props.authors.map((author) => author.name).join('\u0000'),
  ] as const,
  ([value, disabled]) => {
    cancelPendingSearch()
    const term = value.trim()
    if (term.length < 2 || disabled || props.authors.length >= 5) {
      remoteSuggestions.value = []
      suggestionsOpen.value = false
      highlightedIndex.value = -1
      announcement.value = ''
      return
    }

    remoteSuggestions.value = []
    suggestionsOpen.value = false
    highlightedIndex.value = -1
    announcement.value = 'Carregando sugestões de autores.'
    const sequence = requestSequence
    debounceTimer = setTimeout(async () => {
      debounceTimer = null
      const controller = new AbortController()
      activeController = controller
      try {
        const data = await $fetch<{ works: SearchResult[] }>(
          `/api/search?q=${encodeURIComponent(term)}`,
          { timeout: 15_000, retry: 0, signal: controller.signal },
        )
        if (sequence !== requestSequence || controller.signal.aborted) return

        const matchingAuthors: string[] = []
        const termLower = term.toLowerCase()
        for (const work of data.works ?? []) {
          for (const author of work.authors ?? []) {
            const normalized = author.name.toLowerCase()
            if (
              normalized.includes(termLower)
              && !matchingAuthors.some((name) => name.toLowerCase() === normalized)
              && !props.authors.some((existing) => existing.name.toLowerCase() === normalized)
            ) {
              matchingAuthors.push(author.name)
            }
          }
        }
        remoteSuggestions.value = matchingAuthors.slice(0, 5)
        suggestionsOpen.value = remoteSuggestions.value.length > 0
        announcement.value = remoteSuggestions.value.length > 0
          ? `${remoteSuggestions.value.length} ${remoteSuggestions.value.length === 1 ? 'sugestão encontrada' : 'sugestões encontradas'}.`
          : 'Nenhuma sugestão de autor encontrada.'
      } catch {
        if (sequence !== requestSequence || controller.signal.aborted) return
        remoteSuggestions.value = []
        suggestionsOpen.value = false
        announcement.value = 'Não foi possível carregar sugestões de autores.'
      } finally {
        if (sequence === requestSequence) {
          activeController = null
        }
      }
    }, 250)
  },
  { flush: 'sync' },
)

onBeforeUnmount(() => {
  cancelPendingSearch()
  if (blurTimer !== null) clearTimeout(blurTimer)
})
</script>

<style scoped>
.author-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.author-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  background-color: var(--input-bg);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: var(--radius-sm);
  padding: 4px var(--space-3);
  color: #fff;
  font-size: var(--font-size-sm);
}

.author-tag-remove {
  background: none;
  border: none;
  color: var(--text-color);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  transition: all 0.15s;
}

.author-tag-remove:hover {
  color: #fff;
  background-color: rgba(255, 255, 255, 0.2);
}

.author-tag-remove:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.author-input-row {
  display: flex;
  gap: var(--space-2);
}

.form-input {
  background-color: var(--input-bg);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: var(--radius-sm);
  color: #fff;
  padding: var(--space-3);
  font-size: var(--font-size-base);
  font-family: inherit;
  transition: border-color 0.2s;
  width: 100%;
  box-sizing: border-box;
  min-height: 44px;
}

.form-input:focus,
.form-input:focus-visible {
  outline: none;
  border-color: var(--highlight);
}

.form-input.has-error {
  border-color: var(--danger);
}

.field-hint {
  font-size: var(--font-size-xs);
  color: var(--text-color);
  margin: 0;
}

.field-error {
  font-size: var(--font-size-xs);
  color: var(--danger);
  font-weight: 500;
  margin: 0;
}

.author-input-wrap {
  position: relative;
  flex: 1;
}

.author-suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 20;
  margin: var(--space-1) 0 0 0;
  padding: 0;
  list-style: none;
  background-color: var(--card-bg);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  max-height: 200px;
  overflow-y: auto;
}

.author-suggestion-item {
  padding: var(--space-2) var(--space-3);
  color: var(--text-color);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.author-suggestion-item:hover,
.author-suggestion-item.is-active {
  background-color: var(--input-bg);
  color: #fff;
}

.btn-add-author {
  min-height: 44px;
  white-space: nowrap;
}

.author-sr-only {
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

@media (prefers-reduced-motion: reduce) {
  .author-tag-remove,
  .author-suggestion-item {
    transition: none;
  }
}
</style>
