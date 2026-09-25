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
              É este livro
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
      <div v-if="!hideHeader" class="form-header">
        <h1 class="form-title">Cadastrar livro</h1>
        <p class="form-copy">
          Não encontrou? Adicione o livro — leva menos de um minuto.
        </p>
      </div>

      <!-- General Server Error -->
      <div v-if="serverError" class="server-error" role="alert">
        {{ serverError }}
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
            :aria-invalid="Boolean(errors.title)"
            :aria-describedby="errors.title ? 'book-title-error' : undefined"
            @blur="validateField('title')"
          >
          <span v-if="errors.title" id="book-title-error" class="field-error" role="alert">
            {{ errors.title }}
          </span>
        </div>

        <!-- Authors (Tag Input with Autocomplete) -->
        <div class="form-group">
          <label for="author-input" class="form-label">
            Autores <span class="required-indicator" aria-hidden="true">*</span>
          </label>
          <p id="author-hint" class="field-hint">
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
                :aria-invalid="Boolean(errors.authors)"
                :aria-describedby="errors.authors ? 'author-error' : 'author-hint'"
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

          <span v-if="errors.authors" id="author-error" class="field-error" role="alert">
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
          aria-controls="more-details-content"
          @click="showMoreDetails = !showMoreDetails"
        >
          <span class="disclosure-icon" aria-hidden="true">
            {{ showMoreDetails ? '−' : '+' }}
          </span>
          <span>{{ showMoreDetails ? 'Ocultar detalhes da obra' : 'Adicionar detalhes (ano, idioma, país, gêneros, série)' }}</span>
        </button>

        <div v-if="showMoreDetails" id="more-details-content" class="disclosure-content">
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
                :aria-invalid="errors.first_published_year ? 'true' : undefined"
                :aria-describedby="errors.first_published_year ? 'work-year-hint work-year-error' : 'work-year-hint'"
                @blur="validateField('first_published_year')"
              >
              <span id="work-year-hint" class="field-hint">Aceita anos antes de Cristo com sinal negativo (ex: -500).</span>
              <span v-if="errors.first_published_year" id="work-year-error" class="field-error" role="alert">
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
                aria-describedby="series-number-hint"
              >
              <span id="series-number-hint" class="field-hint">Texto livre.</span>
            </div>
          </div>

          <!-- Author country (applied to every listed author) -->
          <div class="form-group">
            <label for="author-country" class="form-label">País de origem do autor</label>
            <input
              id="author-country"
              v-model="authorCountry"
              type="text"
              class="form-input"
              placeholder="ex: Brasil, EUA, Portugal, Roma Antiga"
              maxlength="100"
              :disabled="submitting"
              aria-describedby="author-country-hint"
            >
            <span id="author-country-hint" class="field-hint">Preenchido ao cadastrar o autor. Autores já cadastrados mantêm o país atual.</span>
            <span v-if="errors.author_country" id="author-country-error" class="field-error" role="alert">
              {{ errors.author_country }}
            </span>
          </div>

          <!-- Genre Picker -->
          <div class="form-group">
            <span id="genre-picker-label" class="form-label">Gêneros (até 4)</span>
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
          aria-controls="edition-details-content"
          @click="showEdition = !showEdition"
        >
          <span class="disclosure-icon" aria-hidden="true">
            {{ showEdition ? '−' : '+' }}
          </span>
          <span>{{ showEdition ? 'Ocultar detalhes da edição' : 'Adicionar detalhes desta edição (ISBN, editora, páginas, idioma, capa)' }}</span>
        </button>

        <div v-if="showEdition" id="edition-details-content" class="disclosure-content">
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
                aria-describedby="edition-isbn-hint"
              >
              <span id="edition-isbn-hint" class="field-hint">ISBN-13 ou ISBN-10 (normalizado automaticamente).</span>
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
                :aria-invalid="errors.page_count ? 'true' : undefined"
                :aria-describedby="errors.page_count ? 'edition-pages-error' : undefined"
                @blur="validateField('page_count')"
              >
              <span v-if="errors.page_count" id="edition-pages-error" class="field-error" role="alert">
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
                :aria-invalid="errors.published_year ? 'true' : undefined"
                :aria-describedby="errors.published_year ? 'edition-year-error' : undefined"
                @blur="validateField('published_year')"
              >
              <span v-if="errors.published_year" id="edition-year-error" class="field-error" role="alert">
                {{ errors.published_year }}
              </span>
            </div>
          </div>

          <!-- Edition Language -->
          <div class="form-group">
            <label for="edition-language" class="form-label">Idioma desta edição</label>
            <select
              id="edition-language"
              v-model="editionLanguage"
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
              :aria-invalid="errors.cover_url ? 'true' : undefined"
              :aria-describedby="errors.cover_url ? 'cover-url-hint cover-url-error' : 'cover-url-hint'"
              @blur="validateField('cover_url'); previewCoverUrl = editionCoverUrl.trim()"
            >
            <span id="cover-url-hint" class="field-hint">A URL precisa começar obrigatoriamente com https://.</span>
            <span v-if="errors.cover_url" id="cover-url-error" class="field-error" role="alert">
              {{ errors.cover_url }}
            </span>
            <div v-if="previewCoverUrl" class="cover-preview">
              <div class="cover-preview-thumb">
                <BookCover
                  :alt="title.trim() ? `Pré-visualização da capa de ${title.trim()}` : 'Pré-visualização da capa informada'"
                  :title="title.trim() || 'Capa'"
                  :cover-url="previewCoverUrl"
                />
              </div>
              <p class="field-hint">Pré-visualização da URL informada. Se a imagem não carregar, exibimos as iniciais do título.</p>
            </div>
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
import { isTimeoutOrAbort, TIMEOUT_MESSAGE } from '~/utils/fetch-error'
import { onMounted, ref, watch } from 'vue'
import BookCover from '../book/BookCover.vue'
import GenrePicker from './GenrePicker.vue'
import { LANGUAGES } from '~~/shared/constants/languages'
import { countryCodeFor, countryLabelFor } from '~~/shared/constants/countries'
import type { SearchResult } from '~~/shared/schemas/search'
import { coverUrlSchema, publicationYearSchema, type WorkInput } from '~~/shared/schemas/work'

const props = withDefaults(
  defineProps<{
    initialTitle?: string
    returnTo?: string
    hideHeader?: boolean
  }>(),
  {
    initialTitle: '',
    returnTo: '/app/novo',
    hideHeader: false,
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
const authorCountry = ref('')
const firstPublishedYear = ref<number | null>(null)
const originalLanguage = ref('')
const genreIds = ref<number[]>([])
const seriesName = ref('')
const seriesNumber = ref('')

// Disclosures
const showMoreDetails = ref(false)
const showEdition = ref(false)

// Edition fields
const editionIsbn = ref('')
const editionPublisher = ref('')
const editionPageCount = ref<number | null>(null)
const editionPublishedYear = ref<number | null>(null)
const editionLanguage = ref('')
const editionCoverUrl = ref('')
// Committed on blur: rendering BookCover per keystroke fires one image request
// per character typed. The payload always uses editionCoverUrl.
const previewCoverUrl = ref('')

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
        {
          timeout: 15_000,
          retry: 0,
        },
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
      // Debounced typeahead. Stays silent on purpose: a suggestion lookup that
      // times out while the user is still typing must not raise serverError.
      authorSuggestions.value = []
      showAuthorSuggestions.value = false
    }
  }, 250)
})

// ---------------------------------------------------------------------------
// Author country: free text resolved to ISO via shared/constants/countries.
// The stored label is canonicalised through countryLabelFor when a code is
// known, so the book page (which renders the label) agrees with the profile
// and map (which derive the name from the code). Unknown labels (e.g.
// 'Roma Antiga') persist as-is with a null code.
// ---------------------------------------------------------------------------

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

  if (authorCountry.value.trim().length > 100) {
    errors.value.author_country = 'O país do autor não pode ter mais de 100 caracteres.'
  } else {
    delete errors.value.author_country
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
      authorCountry: authorCountry.value,
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
      editionLanguage: editionLanguage.value,
      editionCoverUrl: editionCoverUrl.value,
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
    if (typeof draft.authorCountry === 'string') {
      authorCountry.value = draft.authorCountry
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
    if (typeof draft.editionLanguage === 'string') {
      editionLanguage.value = draft.editionLanguage
    }
    if (draft.editionCoverUrl !== undefined) {
      editionCoverUrl.value = draft.editionCoverUrl
      previewCoverUrl.value = typeof draft.editionCoverUrl === 'string' ? draft.editionCoverUrl.trim() : ''
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
    authorCountry,
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
    editionLanguage,
    editionCoverUrl,
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

  const rawCountryLabel = authorCountry.value.trim() || null
  const countryCode = countryCodeFor(rawCountryLabel)
  // Canonical label so every surface agrees: the book page renders the label,
  // the profile and map derive the name from the code via formatCountryName.
  const countryLabel = rawCountryLabel
    ? (countryCode ? countryLabelFor(countryCode) ?? rawCountryLabel : rawCountryLabel)
    : null

  const payload: WorkInput = {
    title: title.value.trim(),
    authors: authors.value.map((a) => ({
      name: a.name.trim(),
      country_code: countryCode,
      country_label: countryLabel,
    })),
    genre_ids: genreIds.value,
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
      editionLanguage.value ||
      editionCoverUrl.value.trim(),
  )

  if (hasEdition) {
    payload.edition = {
      isbn: editionIsbn.value.trim() || null,
      publisher: editionPublisher.value.trim() || null,
      page_count: editionPageCount.value ? Number(editionPageCount.value) : null,
      published_year: editionPublishedYear.value
        ? Number(editionPublishedYear.value)
        : null,
      language: editionLanguage.value || null,
      cover_url: editionCoverUrl.value.trim() || null,
    }
  }

  try {
    const url = force ? '/api/works?forcar=1' : '/api/works'
    const res = await $fetch<{ id: string; slug: string }>(url, {
      method: 'POST',
      // Without a timeout this promise can never settle: a request lost
      // without the server answering or closing leaves `finally` unreached,
      // `submitting` stuck true, and the button reading "Cadastrando..." forever
      // with no error and no way out but a reload. Observed in the wild.
      timeout: 15_000,
      body: payload,
    })

    clearDraft()
    emit('success', res)

    const target = props.returnTo || '/app/novo'
    if (target === '/') {
      await navigateTo('/')
    } else {
      const sep = target.includes('?') ? '&' : '?'
      await navigateTo(`${target}${sep}work_id=${res.id}`)
    }
  } catch (err: unknown) {
    if (isTimeoutOrAbort(err)) {
      serverError.value = TIMEOUT_MESSAGE
      return
    }
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
  if (target === '/') {
    await navigateTo('/')
  } else {
    const sep = target.includes('?') ? '&' : '?'
    await navigateTo(`${target}${sep}work_id=${duplicateWork.value.id}`)
  }
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

.form-input:focus-visible {
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

.cover-preview {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  margin-top: var(--space-2);
  background-color: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
}

.cover-preview-thumb {
  width: 60px;
  min-width: 60px;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--input-bg);
  background-color: #1e2328;
  flex-shrink: 0;
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

.author-tag-remove:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
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

.disclosure-toggle:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
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

.btn:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
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

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
  .btn,
  .form-input,
  .disclosure-toggle,
  .author-tag-remove,
  .author-suggestion-item {
    transition: none;
  }
}
</style>
