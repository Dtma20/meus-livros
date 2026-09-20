<template>
  <div class="add-book-form-wrap">
    <!-- Duplicate 409 Resolution Banner -->
    <div v-if="duplicateWork" class="duplicate-prompt" role="alert">
      <div class="duplicate-header">
        <h3 class="duplicate-title">Obra encontrada no catálogo</h3>
        <p class="duplicate-subtitle">
          Já existe uma obra cadastrada com este título e autor. É este o livro que você procura?
        </p>
      </div>

      <div class="duplicate-card">
        <div class="duplicate-cover">
          <BookCover
            :alt="`Capa de ${duplicateWork.title}`"
            :title="duplicateWork.title"
            :cover-url="duplicateWork.cover_url"
          />
        </div>
        <div class="duplicate-info">
          <h4 class="duplicate-work-title">{{ duplicateWork.title }}</h4>
          <a
            v-if="duplicateWork.slug"
            :href="`/livro/${duplicateWork.slug}`"
            target="_blank"
            class="duplicate-link"
          >
            Ver detalhes desta obra ↗
          </a>

          <div class="duplicate-actions">
            <button
              type="button"
              class="btn btn-primary"
              :disabled="submitting"
              @click="useExistingDuplicate"
            >
              ✓ É este livro
            </button>
            <button
              type="button"
              class="btn btn-secondary"
              :disabled="submitting"
              @click="forceCreateWork"
            >
              Não, criar assim mesmo
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Add Book Form -->
    <form class="add-book-form" novalidate @submit.prevent="handleSubmit(false)">
      <div class="form-header">
        <h2 class="form-title">Cadastrar livro</h2>
        <p class="form-copy">
          Não encontrou? Adicione o livro — leva menos de um minuto.
        </p>
      </div>

      <!-- General Server Error -->
      <div v-if="serverError" class="server-error" role="alert">
        {{ serverError }}
      </div>

      <!-- External Lookup (Open Library) -->
      <ExternalLookup
        :query="title"
        :disabled="submitting"
        :auto-lookup="autoLookup"
        @select="handleExternalSelect"
      />

      <!-- Prompt when Open Library has different values for already-typed fields -->
      <div v-if="pendingExternalBook" class="external-changes-prompt" role="alert">
        <h3 class="changes-title">Dados encontrados no Open Library</h3>
        <p class="changes-subtitle">
          Os seguintes campos já preenchidos têm valores diferentes dos dados online:
        </p>
        <ul class="changes-list">
          <li v-for="c in pendingChanges" :key="c.field">
            <strong>{{ c.label }}:</strong> de <em>"{{ c.current }}"</em> para <em>"{{ c.incoming }}"</em>
          </li>
        </ul>
        <div class="changes-actions">
          <button
            type="button"
            class="btn btn-primary"
            @click="applyExternalBook(pendingExternalBook, true)"
          >
            Substituir com dados online
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            @click="applyExternalBook(pendingExternalBook, false)"
          >
            Manter o que digitei (preencher apenas vazios)
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            @click="cancelExternalBook"
          >
            Cancelar
          </button>
        </div>
      </div>

      <!-- Visible Required Fields -->
      <div class="form-section">
        <!-- Title -->
        <div class="form-group">
          <label for="book-title" class="form-label">
            Título <span class="required-indicator" aria-hidden="true">*</span>
          </label>
          <input
            id="book-title"
            v-model="title"
            type="text"
            class="form-input"
            :class="{ 'has-error': errors.title }"
            placeholder="ex: Dom Casmurro"
            maxlength="300"
            required
            :disabled="submitting"
            @blur="validateField('title')"
          >
          <span v-if="errors.title" class="field-error" role="alert">
            {{ errors.title }}
          </span>
        </div>

        <!-- Authors (Tag Input with Autocomplete) -->
        <div class="form-group">
          <label for="author-input" class="form-label">
            Autores <span class="required-indicator" aria-hidden="true">*</span>
          </label>
          <p class="field-hint">
            Pressione Enter ou clique em Adicionar para cada autor.
          </p>

          <!-- Selected Author Tags -->
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
                :disabled="submitting"
                @click="removeAuthor(index)"
              >
                ×
              </button>
            </span>
          </div>

          <!-- Author Input Row -->
          <div class="author-input-row">
            <div class="author-input-wrap">
              <input
                id="author-input"
                ref="authorInputRef"
                v-model="authorInput"
                type="text"
                class="form-input"
                :class="{ 'has-error': errors.authors }"
                placeholder="Nome do autor..."
                autocomplete="off"
                :disabled="submitting || authors.length >= 5"
                @keydown="onAuthorKeydown"
                @focus="onAuthorFocus"
                @blur="onAuthorBlur"
              >

              <!-- Autocomplete suggestions dropdown -->
              <ul
                v-if="showAuthorSuggestions && authorSuggestions.length > 0"
                class="author-suggestions"
                role="listbox"
                aria-label="Sugestões de autores"
              >
                <li
                  v-for="(suggestion, sIndex) in authorSuggestions"
                  :key="suggestion"
                  class="author-suggestion-item"
                  :class="{ 'is-active': sIndex === highlightedSuggestionIndex }"
                  role="option"
                  :aria-selected="sIndex === highlightedSuggestionIndex"
                  @mousedown.prevent="selectAuthorSuggestion(suggestion)"
                >
                  {{ suggestion }}
                </li>
              </ul>
            </div>

            <button
              type="button"
              class="btn btn-secondary btn-add-author"
              :disabled="submitting || !authorInput.trim() || authors.length >= 5"
              @click="addAuthorFromInput"
            >
              Adicionar
            </button>
          </div>

          <span v-if="errors.authors" class="field-error" role="alert">
            {{ errors.authors }}
          </span>
          <span v-else-if="authors.length >= 5" class="field-hint">
            Limite máximo de 5 autores atingido.
          </span>
        </div>
      </div>

      <!-- Progressive Disclosure: Additional Work Details -->
      <div class="disclosure-section">
        <button
          type="button"
          class="disclosure-toggle"
          :aria-expanded="showMoreDetails"
          @click="showMoreDetails = !showMoreDetails"
        >
          <span class="disclosure-icon" aria-hidden="true">
            {{ showMoreDetails ? '−' : '+' }}
          </span>
          <span>{{ showMoreDetails ? 'Ocultar detalhes da obra' : 'Adicionar detalhes (ano, idioma, gêneros, série)' }}</span>
        </button>

        <div v-if="showMoreDetails" class="disclosure-content">
          <!-- First Published Year & Original Language -->
          <div class="form-row">
            <div class="form-group flex-1">
              <label for="work-year" class="form-label">Ano da 1ª publicação</label>
              <input
                id="work-year"
                v-model.number="firstPublishedYear"
                type="number"
                class="form-input"
                :class="{ 'has-error': errors.first_published_year }"
                placeholder="ex: 1899 ou -500"
                :disabled="submitting"
                @blur="validateField('first_published_year')"
              >
              <span class="field-hint">Aceita anos antes de Cristo com sinal negativo (ex: -500).</span>
              <span v-if="errors.first_published_year" class="field-error" role="alert">
                {{ errors.first_published_year }}
              </span>
            </div>

            <div class="form-group flex-1">
              <label for="work-language" class="form-label">Idioma original</label>
              <select
                id="work-language"
                v-model="originalLanguage"
                class="form-input form-select"
                :disabled="submitting"
              >
                <option value="">Selecione o idioma...</option>
                <option
                  v-for="lang in LANGUAGES"
                  :key="lang.code"
                  :value="lang.code"
                >
                  {{ lang.label }}
                </option>
              </select>
            </div>
          </div>

          <!-- Series Name & Number -->
          <div class="form-row">
            <div class="form-group flex-2">
              <label for="work-series-name" class="form-label">Série / Coleção</label>
              <input
                id="work-series-name"
                v-model="seriesName"
                type="text"
                class="form-input"
                placeholder="ex: O Senhor dos Anéis"
                maxlength="200"
                :disabled="submitting"
              >
            </div>

            <div class="form-group flex-1">
              <label for="work-series-number" class="form-label">Volume na série</label>
              <input
                id="work-series-number"
                v-model="seriesNumber"
                type="text"
                class="form-input"
                placeholder="ex: 1, 1-2, 0.1"
                maxlength="20"
                :disabled="submitting"
              >
              <span class="field-hint">Texto livre.</span>
            </div>
          </div>

          <!-- Genre Picker -->
          <div class="form-group">
            <label class="form-label">Gêneros (até 4)</label>
            <GenrePicker
              v-model="genreIds"
              :disabled="submitting"
            />
          </div>
        </div>
      </div>

      <!-- Progressive Disclosure: Edition Details -->
      <div class="disclosure-section">
        <button
          type="button"
          class="disclosure-toggle"
          :aria-expanded="showEdition"
          @click="showEdition = !showEdition"
        >
          <span class="disclosure-icon" aria-hidden="true">
            {{ showEdition ? '−' : '+' }}
          </span>
          <span>{{ showEdition ? 'Ocultar detalhes da edição' : 'Adicionar detalhes desta edição (ISBN, editora, páginas, capa)' }}</span>
        </button>

        <div v-if="showEdition" class="disclosure-content">
          <!-- ISBN & Publisher -->
          <div class="form-row">
            <div class="form-group flex-1">
              <label for="edition-isbn" class="form-label">ISBN</label>
              <input
                id="edition-isbn"
                v-model="editionIsbn"
                type="text"
                class="form-input"
                placeholder="ex: 9788535902778"
                maxlength="40"
                :disabled="submitting"
              >
              <span class="field-hint">ISBN-13 ou ISBN-10 (normalizado automaticamente).</span>
            </div>

            <div class="form-group flex-1">
              <label for="edition-publisher" class="form-label">Editora</label>
              <input
                id="edition-publisher"
                v-model="editionPublisher"
                type="text"
                class="form-input"
                placeholder="ex: Companhia das Letras"
                maxlength="200"
                :disabled="submitting"
              >
            </div>
          </div>

          <!-- Page Count & Published Year -->
          <div class="form-row">
            <div class="form-group flex-1">
              <label for="edition-pages" class="form-label">Número de páginas</label>
              <input
                id="edition-pages"
                v-model.number="editionPageCount"
                type="number"
                min="1"
                class="form-input"
                :class="{ 'has-error': errors.page_count }"
                placeholder="ex: 256"
                :disabled="submitting"
                @blur="validateField('page_count')"
              >
              <span v-if="errors.page_count" class="field-error" role="alert">
                {{ errors.page_count }}
              </span>
            </div>

            <div class="form-group flex-1">
              <label for="edition-year" class="form-label">Ano desta edição</label>
              <input
                id="edition-year"
                v-model.number="editionPublishedYear"
                type="number"
                class="form-input"
                :class="{ 'has-error': errors.published_year }"
                placeholder="ex: 2019"
                :disabled="submitting"
                @blur="validateField('published_year')"
              >
              <span v-if="errors.published_year" class="field-error" role="alert">
                {{ errors.published_year }}
              </span>
            </div>
          </div>

          <!-- Cover URL -->
          <div class="form-group">
            <label for="edition-cover-url" class="form-label">URL da imagem da capa</label>
            <input
              id="edition-cover-url"
              v-model="editionCoverUrl"
              type="url"
              class="form-input"
              :class="{ 'has-error': errors.cover_url }"
              placeholder="https://exemplo.com/capa.jpg"
              maxlength="2000"
              :disabled="submitting"
              @blur="validateField('cover_url')"
            >
            <span class="field-hint">A URL precisa começar obrigatoriamente com https://.</span>
            <span v-if="errors.cover_url" class="field-error" role="alert">
              {{ errors.cover_url }}
            </span>
          </div>
        </div>
      </div>

      <!-- Form Actions -->
      <div class="form-actions">
        <button
          type="submit"
          class="btn btn-primary btn-submit"
          :disabled="submitting"
        >
          <span v-if="submitting" class="spinner" aria-hidden="true" />
          <span>{{ submitting ? 'Cadastrando...' : 'Cadastrar livro' }}</span>
        </button>

        <button
          v-if="returnTo"
          type="button"
          class="btn btn-secondary"
          :disabled="submitting"
          @click="handleCancel"
        >
          Cancelar
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import BookCover from '../book/BookCover.vue'
import ExternalLookup from './ExternalLookup.vue'
import GenrePicker from './GenrePicker.vue'
import { LANGUAGES } from '~~/shared/constants/languages'
import type { ExternalBookResult, SearchResult } from '~~/shared/schemas/search'
import { coverUrlSchema, publicationYearSchema, type WorkInput } from '~~/shared/schemas/work'

const props = withDefaults(
  defineProps<{
    initialTitle?: string
    returnTo?: string
    autoLookup?: boolean
  }>(),
  {
    initialTitle: '',
    returnTo: '/app/novo',
    autoLookup: false,
  },
)

const emit = defineEmits<{
  (e: 'success', work: { id: string; slug: string }): void
  (e: 'cancel'): void
}>()

const DRAFT_KEY = 'meus-livros:add-book-draft'

// Form Fields
const title = ref(props.initialTitle || '')
const authors = ref<Array<{ name: string }>>([])
const authorInput = ref('')
const firstPublishedYear = ref<number | null>(null)
const originalLanguage = ref('')
const genreIds = ref<number[]>([])
const seriesName = ref('')
const seriesNumber = ref('')

// Open Library fields & conflict state
const olWorkKey = ref('')
const olCoverId = ref<number | null>(null)
const pendingExternalBook = ref<ExternalBookResult | null>(null)
const pendingChanges = ref<
  Array<{ field: string; label: string; current: string; incoming: string }>
>([])

// Disclosures
const showMoreDetails = ref(false)
const showEdition = ref(false)

// Edition fields
const editionIsbn = ref('')
const editionPublisher = ref('')
const editionPageCount = ref<number | null>(null)
const editionPublishedYear = ref<number | null>(null)
const editionCoverUrl = ref('')

// State & UI feedback
const submitting = ref(false)
const serverError = ref('')
const errors = ref<Record<string, string>>({})

// Autocomplete
const authorInputRef = ref<HTMLInputElement | null>(null)
const authorSuggestions = ref<string[]>([])
const showAuthorSuggestions = ref(false)
const highlightedSuggestionIndex = ref(-1)
let authorDebounceTimer: ReturnType<typeof setTimeout> | null = null

// Duplicate detection (409)
interface DuplicateWorkState {
  id: string
  slug: string
  title: string
  cover_url?: string | null
}
const duplicateWork = ref<DuplicateWorkState | null>(null)

// ---------------------------------------------------------------------------
// Author Management & Autocomplete
// ---------------------------------------------------------------------------
function addAuthor(name: string): void {
  const trimmed = name.trim()
  if (!trimmed) return

  const exists = authors.value.some(
    (a) => a.name.toLowerCase() === trimmed.toLowerCase(),
  )
  if (!exists) {
    if (authors.value.length >= 5) {
      errors.value.authors = 'No máximo 5 autores são permitidos.'
      return
    }
    authors.value.push({ name: trimmed })
    delete errors.value.authors
    saveDraft()
  }

  authorInput.value = ''
  authorSuggestions.value = []
  showAuthorSuggestions.value = false
  highlightedSuggestionIndex.value = -1
}

function addAuthorFromInput(): void {
  if (authorInput.value.trim()) {
    addAuthor(authorInput.value)
  }
}

function removeAuthor(index: number): void {
  authors.value.splice(index, 1)
  if (authors.value.length === 0) {
    errors.value.authors = 'Adicione pelo menos um autor.'
  }
  saveDraft()
}

function onAuthorFocus(): void {
  if (authorSuggestions.value.length > 0) {
    showAuthorSuggestions.value = true
  }
}

function onAuthorBlur(): void {
  setTimeout(() => {
    showAuthorSuggestions.value = false
    highlightedSuggestionIndex.value = -1
  }, 180)
}

function selectAuthorSuggestion(name: string): void {
  addAuthor(name)
  authorInputRef.value?.focus()
}

function onAuthorKeydown(e: KeyboardEvent): void {
  if (showAuthorSuggestions.value && authorSuggestions.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      highlightedSuggestionIndex.value = Math.min(
        highlightedSuggestionIndex.value + 1,
        authorSuggestions.value.length - 1,
      )
      return
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      highlightedSuggestionIndex.value = Math.max(
        highlightedSuggestionIndex.value - 1,
        0,
      )
      return
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (
        highlightedSuggestionIndex.value >= 0 &&
        authorSuggestions.value[highlightedSuggestionIndex.value]
      ) {
        selectAuthorSuggestion(
          authorSuggestions.value[highlightedSuggestionIndex.value]!,
        )
        return
      }
    } else if (e.key === 'Escape') {
      showAuthorSuggestions.value = false
      return
    }
  }

  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    addAuthorFromInput()
  }
}

watch(authorInput, (val) => {
  const term = val.trim()
  if (authorDebounceTimer) clearTimeout(authorDebounceTimer)

  if (term.length < 2) {
    authorSuggestions.value = []
    showAuthorSuggestions.value = false
    return
  }

  authorDebounceTimer = setTimeout(async () => {
    try {
      const data = await $fetch<{ works: SearchResult[] }>(
        `/api/search?q=${encodeURIComponent(term)}`,
      )
      const matchingAuthors: string[] = []
      const termLower = term.toLowerCase()

      for (const w of data.works ?? []) {
        for (const a of w.authors ?? []) {
          if (
            a.name.toLowerCase().includes(termLower) &&
            !matchingAuthors.includes(a.name) &&
            !authors.value.some((existing) => existing.name.toLowerCase() === a.name.toLowerCase())
          ) {
            matchingAuthors.push(a.name)
          }
        }
      }

      authorSuggestions.value = matchingAuthors.slice(0, 5)
      showAuthorSuggestions.value = authorSuggestions.value.length > 0
      highlightedSuggestionIndex.value = -1
    } catch {
      authorSuggestions.value = []
      showAuthorSuggestions.value = false
    }
  }, 250)
})
// ---------------------------------------------------------------------------
// Open Library External Lookup Integration
// ---------------------------------------------------------------------------
function handleExternalSelect(book: ExternalBookResult): void {
  const changes: Array<{ field: string; label: string; current: string; incoming: string }> = []

  // Check Title
  if (title.value.trim() && title.value.trim() !== book.title.trim()) {
    changes.push({
      field: 'title',
      label: 'Título',
      current: title.value.trim(),
      incoming: book.title.trim(),
    })
  }

  // Check Authors
  const incomingAuthors = book.authors
  if (authors.value.length > 0 && incomingAuthors?.length) {
    const currentStr = authors.value.map((a) => a.name.trim()).join(', ')
    const incomingStr = incomingAuthors.map((a) => a.trim()).join(', ')
    if (currentStr.toLowerCase() !== incomingStr.toLowerCase()) {
      changes.push({
        field: 'authors',
        label: 'Autores',
        current: currentStr,
        incoming: incomingStr,
      })
    }
  }

  // Check First Published Year
  if (
    firstPublishedYear.value !== null &&
    firstPublishedYear.value !== undefined &&
    book.first_publish_year !== null &&
    book.first_publish_year !== undefined &&
    firstPublishedYear.value !== book.first_publish_year
  ) {
    changes.push({
      field: 'first_published_year',
      label: 'Ano da 1ª publicação',
      current: String(firstPublishedYear.value),
      incoming: String(book.first_publish_year),
    })
  }

  // Check Original Language
  if (
    originalLanguage.value &&
    book.language &&
    originalLanguage.value.toLowerCase() !== book.language.toLowerCase()
  ) {
    changes.push({
      field: 'original_language',
      label: 'Idioma original',
      current: originalLanguage.value,
      incoming: book.language,
    })
  }

  // Check Cover URL
  if (
    editionCoverUrl.value.trim() &&
    book.cover_url &&
    editionCoverUrl.value.trim() !== book.cover_url.trim()
  ) {
    changes.push({
      field: 'cover_url',
      label: 'URL da capa',
      current: editionCoverUrl.value,
      incoming: book.cover_url,
    })
  }

  if (changes.length > 0) {
    pendingExternalBook.value = book
    pendingChanges.value = changes
  } else {
    applyExternalBook(book, false)
  }
}

function applyExternalBook(book: ExternalBookResult, overwrite: boolean): void {
  // Title
  if (overwrite || !title.value.trim()) {
    title.value = book.title
    validateField('title')
  }

  // Authors (limit 5)
  const incomingAuthors = book.authors
  if (overwrite || authors.value.length === 0) {
    if (incomingAuthors && incomingAuthors.length > 0) {
      authors.value = incomingAuthors.slice(0, 5).map((name) => ({ name: name.trim() }))
      delete errors.value.authors
    }
  }

  // First published year
  if (
    book.first_publish_year !== null &&
    book.first_publish_year !== undefined &&
    (overwrite || firstPublishedYear.value === null || firstPublishedYear.value === undefined)
  ) {
    firstPublishedYear.value = book.first_publish_year
    showMoreDetails.value = true
    validateField('first_published_year')
  }

  // Original language
  if (book.language && (overwrite || !originalLanguage.value)) {
    originalLanguage.value = book.language
    showMoreDetails.value = true
  }

  // Open Library work key
  if (book.ol_work_key) {
    olWorkKey.value = book.ol_work_key
  }

  // Cover & OL Cover ID
  if (book.ol_cover_id) {
    olCoverId.value = book.ol_cover_id
    if (overwrite || !editionCoverUrl.value.trim()) {
      editionCoverUrl.value =
        book.cover_url || `https://covers.openlibrary.org/b/id/${book.ol_cover_id}-M.jpg`
      showEdition.value = true
      validateField('cover_url')
    }
  } else if (book.cover_url && (overwrite || !editionCoverUrl.value.trim())) {
    editionCoverUrl.value = book.cover_url
    showEdition.value = true
    validateField('cover_url')
  }

  // NOTE: Genres are NEVER imported from Open Library.

  pendingExternalBook.value = null
  pendingChanges.value = []
}

function cancelExternalBook(): void {
  pendingExternalBook.value = null
  pendingChanges.value = []
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
function validateField(field: string): void {
  if (field === 'title') {
    const val = title.value.trim()
    if (!val) {
      errors.value.title = 'Informe o título do livro.'
    } else if (val.length > 300) {
      errors.value.title = 'O título não pode ter mais de 300 caracteres.'
    } else {
      delete errors.value.title
    }
  }

  if (field === 'first_published_year') {
    if (
      firstPublishedYear.value !== null &&
      firstPublishedYear.value !== undefined &&
      String(firstPublishedYear.value) !== ''
    ) {
      const parsed = publicationYearSchema.safeParse(Number(firstPublishedYear.value))
      if (!parsed.success) {
        errors.value.first_published_year =
          parsed.error.issues[0]?.message ?? 'Ano inválido (entre -3000 e 2100).'
      } else {
        delete errors.value.first_published_year
      }
    } else {
      delete errors.value.first_published_year
    }
  }

  if (field === 'published_year') {
    if (
      editionPublishedYear.value !== null &&
      editionPublishedYear.value !== undefined &&
      String(editionPublishedYear.value) !== ''
    ) {
      const parsed = publicationYearSchema.safeParse(Number(editionPublishedYear.value))
      if (!parsed.success) {
        errors.value.published_year =
          parsed.error.issues[0]?.message ?? 'Ano da edição inválido (entre -3000 e 2100).'
      } else {
        delete errors.value.published_year
      }
    } else {
      delete errors.value.published_year
    }
  }

  if (field === 'page_count') {
    if (
      editionPageCount.value !== null &&
      editionPageCount.value !== undefined &&
      String(editionPageCount.value) !== ''
    ) {
      const val = Number(editionPageCount.value)
      if (isNaN(val) || val <= 0 || val > 50000) {
        errors.value.page_count = 'O número de páginas deve ser positivo (até 50.000).'
      } else {
        delete errors.value.page_count
      }
    } else {
      delete errors.value.page_count
    }
  }

  if (field === 'cover_url') {
    const val = editionCoverUrl.value.trim()
    if (val) {
      const parsed = coverUrlSchema.safeParse(val)
      if (!parsed.success) {
        errors.value.cover_url =
          parsed.error.issues[0]?.message ?? 'A URL da capa precisa começar com https://'
      } else {
        delete errors.value.cover_url
      }
    } else {
      delete errors.value.cover_url
    }
  }
}

function validateAll(): boolean {
  validateField('title')
  validateField('first_published_year')
  validateField('published_year')
  validateField('page_count')
  validateField('cover_url')

  if (authors.value.length === 0) {
    errors.value.authors = 'Adicione pelo menos um autor.'
  } else if (authors.value.length > 5) {
    errors.value.authors = 'No máximo 5 autores são permitidos.'
  } else {
    delete errors.value.authors
  }

  return Object.keys(errors.value).length === 0
}

// ---------------------------------------------------------------------------
// Draft Persistence
// ---------------------------------------------------------------------------
function saveDraft(): void {
  try {
    const draft = {
      title: title.value,
      authors: authors.value,
      firstPublishedYear: firstPublishedYear.value,
      originalLanguage: originalLanguage.value,
      genreIds: genreIds.value,
      seriesName: seriesName.value,
      seriesNumber: seriesNumber.value,
      showMoreDetails: showMoreDetails.value,
      showEdition: showEdition.value,
      editionIsbn: editionIsbn.value,
      editionPublisher: editionPublisher.value,
      editionPageCount: editionPageCount.value,
      editionPublishedYear: editionPublishedYear.value,
      editionCoverUrl: editionCoverUrl.value,
      olWorkKey: olWorkKey.value,
      olCoverId: olCoverId.value,
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // Ignore private browsing exceptions
  }
}

function restoreDraft(): void {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return
    const draft = JSON.parse(raw)

    if (!props.initialTitle && draft.title) title.value = draft.title
    if (Array.isArray(draft.authors) && draft.authors.length > 0) {
      authors.value = draft.authors
    }
    if (draft.firstPublishedYear !== undefined) {
      firstPublishedYear.value = draft.firstPublishedYear
    }
    if (draft.originalLanguage !== undefined) {
      originalLanguage.value = draft.originalLanguage
    }
    if (Array.isArray(draft.genreIds)) {
      genreIds.value = draft.genreIds
    }
    if (draft.seriesName !== undefined) {
      seriesName.value = draft.seriesName
    }
    if (draft.seriesNumber !== undefined) {
      seriesNumber.value = draft.seriesNumber
    }
    if (draft.showMoreDetails) {
      showMoreDetails.value = true
    }
    if (draft.showEdition) {
      showEdition.value = true
    }
    if (draft.editionIsbn !== undefined) {
      editionIsbn.value = draft.editionIsbn
    }
    if (draft.editionPublisher !== undefined) {
      editionPublisher.value = draft.editionPublisher
    }
    if (draft.editionPageCount !== undefined) {
      editionPageCount.value = draft.editionPageCount
    }
    if (draft.editionPublishedYear !== undefined) {
      editionPublishedYear.value = draft.editionPublishedYear
    }
    if (draft.editionCoverUrl !== undefined) {
      editionCoverUrl.value = draft.editionCoverUrl
    }
    if (draft.olWorkKey !== undefined) {
      olWorkKey.value = draft.olWorkKey
    }
    if (draft.olCoverId !== undefined) {
      olCoverId.value = draft.olCoverId
    }
  } catch {
    // Ignore corrupted drafts
  }
}

function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // Ignore
  }
}

watch(
  [
    title,
    authors,
    firstPublishedYear,
    originalLanguage,
    genreIds,
    seriesName,
    seriesNumber,
    showMoreDetails,
    showEdition,
    editionIsbn,
    editionPublisher,
    editionPageCount,
    editionPublishedYear,
    editionCoverUrl,
    olWorkKey,
    olCoverId,
  ],
  () => {
    saveDraft()
  },
  { deep: true },
)

onMounted(() => {
  restoreDraft()
  if (props.initialTitle) {
    title.value = props.initialTitle
  }
})

// ---------------------------------------------------------------------------
// Submission & Duplicate handling
// ---------------------------------------------------------------------------
async function handleSubmit(force = false): Promise<void> {
  // If the user typed an author name but didn't click add / hit Enter, auto-add it
  if (authorInput.value.trim() && authors.value.length < 5) {
    addAuthor(authorInput.value)
  }

  if (!validateAll()) return

  submitting.value = true
  serverError.value = ''
  duplicateWork.value = null

  const payload: WorkInput = {
    title: title.value.trim(),
    authors: authors.value.map((a) => ({ name: a.name.trim() })),
    genre_ids: genreIds.value,
  }

  if (olWorkKey.value) {
    payload.ol_work_key = olWorkKey.value
  }

  if (
    firstPublishedYear.value !== null &&
    firstPublishedYear.value !== undefined &&
    String(firstPublishedYear.value) !== ''
  ) {
    payload.first_published_year = Number(firstPublishedYear.value)
  }

  if (originalLanguage.value) {
    payload.original_language = originalLanguage.value.toLowerCase()
  }

  if (seriesName.value.trim()) {
    payload.series_name = seriesName.value.trim()
  }

  if (seriesNumber.value.trim()) {
    payload.series_number = seriesNumber.value.trim()
  }

  const hasEdition = Boolean(
    editionIsbn.value.trim() ||
      editionPublisher.value.trim() ||
      editionPageCount.value ||
      editionPublishedYear.value ||
      editionCoverUrl.value.trim() ||
      olCoverId.value,
  )

  if (hasEdition) {
    payload.edition = {
      isbn: editionIsbn.value.trim() || null,
      publisher: editionPublisher.value.trim() || null,
      page_count: editionPageCount.value ? Number(editionPageCount.value) : null,
      published_year: editionPublishedYear.value
        ? Number(editionPublishedYear.value)
        : null,
      cover_url: editionCoverUrl.value.trim() || null,
      ol_cover_id: olCoverId.value ? Number(olCoverId.value) : null,
    }
  }

  try {
    const url = force ? '/api/works?forcar=1' : '/api/works'
    const res = await $fetch<{ id: string; slug: string }>(url, {
      method: 'POST',
      body: payload,
    })

    clearDraft()
    emit('success', res)

    const target = props.returnTo || '/app/novo'
    const sep = target.includes('?') ? '&' : '?'
    await navigateTo(`${target}${sep}work_id=${res.id}`)
  } catch (err: unknown) {
    const e = err as {
      status?: number
      statusCode?: number
      data?: { error?: string; message?: string; work?: DuplicateWorkState }
    }
    const status = e.status ?? e.statusCode

    if (status === 409 && e.data?.work) {
      duplicateWork.value = e.data.work
    } else if (e.data?.message) {
      serverError.value = e.data.message
    } else {
      serverError.value = 'Ocorreu um erro ao cadastrar a obra. Tente novamente.'
    }
  } finally {
    submitting.value = false
  }
}

async function useExistingDuplicate(): Promise<void> {
  if (!duplicateWork.value) return
  clearDraft()
  const target = props.returnTo || '/app/novo'
  const sep = target.includes('?') ? '&' : '?'
  await navigateTo(`${target}${sep}work_id=${duplicateWork.value.id}`)
}

async function forceCreateWork(): Promise<void> {
  await handleSubmit(true)
}

function handleCancel(): void {
  emit('cancel')
  if (props.returnTo) {
    void navigateTo(props.returnTo)
  }
}
</script>

<style scoped>
.add-book-form-wrap {
  width: 100%;
}

/* Duplicate resolution card */
.duplicate-prompt {
  background-color: rgba(64, 188, 244, 0.08);
  border: 1px solid var(--highlight);
  border-radius: var(--radius-md);
  padding: var(--space-5);
  margin-bottom: var(--space-6);
}

.duplicate-title {
  color: var(--highlight);
  font-size: var(--font-size-base);
  margin: 0 0 var(--space-1) 0;
}

.duplicate-subtitle {
  color: var(--text-color);
  font-size: var(--font-size-sm);
  margin: 0 0 var(--space-4) 0;
}

.duplicate-card {
  display: flex;
  gap: var(--space-4);
  align-items: flex-start;
  background-color: var(--card-bg);
  padding: var(--space-4);
  border-radius: var(--radius-sm);
}

.duplicate-cover {
  width: 60px;
  flex-shrink: 0;
}

.duplicate-info {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1;
}

.duplicate-work-title {
  margin: 0;
  color: #fff;
  font-size: var(--font-size-base);
  line-height: var(--line-height-tight);
}

.duplicate-link {
  color: var(--highlight);
  font-size: var(--font-size-xs);
  text-decoration: none;
}

.duplicate-link:hover {
  text-decoration: underline;
}

.duplicate-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

/* External changes resolution prompt */
.external-changes-prompt {
  background-color: rgba(64, 188, 244, 0.08);
  border: 1px solid var(--highlight);
  border-radius: var(--radius-md);
  padding: var(--space-5);
  margin-bottom: var(--space-6);
}

.changes-title {
  color: var(--highlight);
  font-size: var(--font-size-base);
  margin: 0 0 var(--space-1) 0;
}

.changes-subtitle {
  color: var(--text-color);
  font-size: var(--font-size-sm);
  margin: 0 0 var(--space-3) 0;
}

.changes-list {
  list-style: disc;
  padding-left: var(--space-5);
  margin: 0 0 var(--space-4) 0;
  color: #fff;
  font-size: var(--font-size-sm);
}

.changes-list li {
  margin-bottom: var(--space-1);
}

.changes-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

/* Form Styles */
.form-header {
  margin-bottom: var(--space-6);
}

.form-title {
  color: #fff;
  font-size: var(--font-size-2xl);
  margin: 0 0 var(--space-2) 0;
}

.form-copy {
  color: var(--text-color);
  font-size: var(--font-size-sm);
  margin: 0;
}

.server-error {
  background-color: rgba(239, 68, 68, 0.15);
  border: 1px solid var(--danger);
  color: #fca5a5;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  margin-bottom: var(--space-4);
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  position: relative;
}

.form-row {
  display: flex;
  gap: var(--space-4);
}

@media (max-width: 600px) {
  .form-row {
    flex-direction: column;
    gap: var(--space-4);
  }
}

.flex-1 {
  flex: 1;
}

.flex-2 {
  flex: 2;
}

.form-label {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: #fff;
}

.required-indicator {
  color: var(--highlight);
  margin-left: 2px;
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

.form-input:focus {
  outline: none;
  border-color: var(--highlight);
}

.form-input.has-error {
  border-color: var(--danger);
}

.form-select {
  cursor: pointer;
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

/* Author Tags & Autocomplete */
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
  border-radius: var(--radius-full);
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

.author-input-row {
  display: flex;
  gap: var(--space-2);
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

/* Disclosure Sections */
.disclosure-section {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: var(--space-4);
  margin-bottom: var(--space-4);
}

.disclosure-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  background: none;
  border: none;
  color: var(--highlight);
  font-family: inherit;
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  padding: var(--space-2) 0;
  text-align: left;
  transition: color 0.15s;
}

.disclosure-toggle:hover {
  text-decoration: underline;
}

.disclosure-icon {
  font-size: 16px;
  font-weight: bold;
  line-height: 1;
}

.disclosure-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin-top: var(--space-4);
  padding-left: var(--space-2);
  border-left: 2px solid rgba(255, 255, 255, 0.08);
}

/* Actions and Buttons */
.form-actions {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-6);
  padding-top: var(--space-4);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border-radius: var(--radius-sm);
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  font-weight: 600;
  cursor: pointer;
  padding: 0 var(--space-4);
  min-height: 44px;
  transition: all 0.15s ease-in-out;
  touch-action: manipulation;
  border: none;
  box-sizing: border-box;
}

.btn-primary {
  background-color: var(--star-color);
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background-color: var(--input-bg);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: var(--text-color);
}

.btn-secondary:hover:not(:disabled) {
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-submit {
  flex: 1;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
