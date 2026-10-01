<template>
  <div class="add-book-form-wrap">
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
            size="small"
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
              :disabled="submitting || Boolean(savedWorkHref)"
              @click="useExistingDuplicate"
            >
              É este livro
            </button>
            <button
              type="button"
              class="btn btn-secondary"
              :disabled="submitting || Boolean(savedWorkHref)"
              @click="forceCreateWork"
            >
              Não, criar assim mesmo
            </button>
          </div>
        </div>
      </div>
    </div>

    <form class="add-book-form" novalidate @submit.prevent="handleSubmit(false)">
      <div v-if="!hideHeader" class="form-header">
        <h1 class="form-title">Adicionar livro novo</h1>
        <p class="form-copy">
          Não encontrou? Adicione o livro - leva menos de um minuto.
        </p>
      </div>

      <p v-if="draftRestored" class="draft-notice" role="status" aria-live="polite">
        <span>Rascunho anterior restaurado.</span>
        <button type="button" class="draft-discard-btn" @click="discardDraft">
          Descartar rascunho
        </button>
      </p>

      <div v-if="serverError" class="server-error" role="alert">
        {{ serverError }}
      </div>
      <NuxtLink v-if="savedWorkHref" :to="savedWorkHref" class="saved-work-link">
        Continuar para o livro cadastrado
      </NuxtLink>

      <div class="form-section">
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
            :disabled="submitting || Boolean(savedWorkHref)"
            :aria-invalid="Boolean(errors.title)"
            :aria-describedby="errors.title ? 'book-title-error' : undefined"
            @blur="validateField('title')"
          >
          <span v-if="errors.title" id="book-title-error" class="field-error" role="alert">
            {{ errors.title }}
          </span>
        </div>

        <div class="form-group">
          <label for="author-input" class="form-label">
            Autores <span class="required-indicator" aria-hidden="true">*</span>
          </label>
          <p id="author-hint" class="field-hint">
            Pressione Enter ou clique em Adicionar para cada autor.
          </p>

          <AuthorInput
            v-model:input-value="authorInput"
            :authors="authors"
            :disabled="submitting || Boolean(savedWorkHref)"
            :error="errors.authors"
            @add="addAuthor"
            @remove="removeAuthor"
          />
        </div>
      </div>

      <div class="disclosure-section">
        <button
          type="button"
          class="disclosure-toggle"
          :aria-expanded="showMoreDetails"
          aria-controls="more-details-content"
          :disabled="submitting || Boolean(savedWorkHref)"
          @click="showMoreDetails = !showMoreDetails"
        >
          <span class="disclosure-icon" aria-hidden="true">
            {{ showMoreDetails ? '−' : '+' }}
          </span>
          <span>{{ showMoreDetails ? 'Ocultar detalhes da obra' : 'Adicionar detalhes (ano, idioma, país, gêneros, série)' }}</span>
        </button>

        <div v-if="showMoreDetails" id="more-details-content" class="disclosure-content">
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
                :disabled="submitting || Boolean(savedWorkHref)"
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
                :disabled="submitting || Boolean(savedWorkHref)"
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
                :disabled="submitting || Boolean(savedWorkHref)"
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
                :disabled="submitting || Boolean(savedWorkHref)"
                aria-describedby="series-number-hint"
              >
              <span id="series-number-hint" class="field-hint">Texto livre.</span>
            </div>
          </div>

          <div class="form-group">
            <label for="author-country" class="form-label">País de origem do autor</label>
            <input
              id="author-country"
              v-model="authorCountry"
              type="text"
              class="form-input"
              placeholder="ex: Brasil, EUA, Portugal, Roma Antiga"
              maxlength="100"
              :class="{ 'has-error': errors.author_country }"
              :disabled="submitting || Boolean(savedWorkHref)"
              :aria-invalid="errors.author_country ? 'true' : undefined"
              :aria-describedby="errors.author_country ? 'author-country-hint author-country-error' : 'author-country-hint'"
            >
            <span id="author-country-hint" class="field-hint">Preenchido ao cadastrar o autor. Autores já cadastrados mantêm o país atual.</span>
            <span v-if="errors.author_country" id="author-country-error" class="field-error" role="alert">
              {{ errors.author_country }}
            </span>
          </div>

          <div class="form-group">
            <span id="genre-picker-label" class="form-label">Gêneros (até 4)</span>
            <GenrePicker
              v-model="genreIds"
              :disabled="submitting || Boolean(savedWorkHref)"
            />
          </div>
        </div>
      </div>

      <div class="disclosure-section">
        <button
          type="button"
          class="disclosure-toggle"
          :aria-expanded="showEdition"
          aria-controls="edition-details-content"
          :disabled="submitting || Boolean(savedWorkHref)"
          @click="showEdition = !showEdition"
        >
          <span class="disclosure-icon" aria-hidden="true">
            {{ showEdition ? '−' : '+' }}
          </span>
          <span>{{ showEdition ? 'Ocultar detalhes da edição' : 'Adicionar detalhes desta edição (ISBN, editora, páginas, idioma, capa)' }}</span>
        </button>

        <div v-if="showEdition" id="edition-details-content" class="disclosure-content">
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
                :disabled="submitting || Boolean(savedWorkHref)"
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
                :disabled="submitting || Boolean(savedWorkHref)"
              >
            </div>
          </div>

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
                :disabled="submitting || Boolean(savedWorkHref)"
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
                :disabled="submitting || Boolean(savedWorkHref)"
                :aria-invalid="errors.published_year ? 'true' : undefined"
                :aria-describedby="errors.published_year ? 'edition-year-error' : undefined"
                @blur="validateField('published_year')"
              >
              <span v-if="errors.published_year" id="edition-year-error" class="field-error" role="alert">
                {{ errors.published_year }}
              </span>
            </div>
          </div>

          <div class="form-group">
            <label for="edition-language" class="form-label">Idioma desta edição</label>
            <select
              id="edition-language"
              v-model="editionLanguage"
              class="form-input form-select"
              :disabled="submitting || Boolean(savedWorkHref)"
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
              :disabled="submitting || Boolean(savedWorkHref)"
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
                  size="small"
                />
              </div>
              <p class="field-hint">Pré-visualização da URL informada. Se a imagem não carregar, exibimos as iniciais do título.</p>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="invalidFields.length > 0"
        id="add-book-summary"
        class="error-summary"
        role="alert"
        tabindex="-1"
      >
        <span>Corrija {{ invalidFields.length === 1 ? '1 campo' : `${invalidFields.length} campos` }}: </span>
        <template v-for="(key, i) in invalidFields" :key="key">
          <button type="button" class="error-summary-link" @click="focusField(key)">{{ FIELD_LABELS[key] }}</button><span v-if="i < invalidFields.length - 1">, </span>
        </template>
        <span>.</span>
      </div>

      <div class="form-actions">
        <button
          type="submit"
          class="btn btn-primary btn-submit"
          :disabled="submitting || Boolean(savedWorkHref)"
        >
          <span v-if="submitting" class="spinner" aria-hidden="true" />
          <span>{{ submitting ? 'Adicionando...' : 'Adicionar livro' }}</span>
        </button>

        <button
          v-if="returnTo"
          type="button"
          class="btn btn-secondary"
          :disabled="submitting || Boolean(savedWorkHref)"
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
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { AuthSessionState } from '~/middleware/auth'
import { createFormDraftKey, useFormDraft } from '~/composables/useFormDraft'
import BookCover from '../book/BookCover.vue'
import GenrePicker from './GenrePicker.vue'
import AuthorInput from './AuthorInput.vue'
import { LANGUAGES } from '~~/shared/constants/languages'
import { countryCodeFor, countryLabelFor } from '~~/shared/constants/countries'
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

const authSession = useState<AuthSessionState | null>('auth:session', () => null)

function currentDraftKey(): string | null {
  const context = `${props.returnTo || '/app/novo'}|${props.initialTitle || ''}`
  return createFormDraftKey('add-book', authSession.value?.user?.id, 'create', context)
}

const initialDraftKey = currentDraftKey()

interface AddBookDraft {
  title: string
  authors: Array<{ name: string }>
  authorInput: string
  authorCountry: string
  firstPublishedYear: number | null
  originalLanguage: string
  genreIds: number[]
  seriesName: string
  seriesNumber: string
  showMoreDetails: boolean
  showEdition: boolean
  editionIsbn: string
  editionPublisher: string
  editionPageCount: number | null
  editionPublishedYear: number | null
  editionLanguage: string
  editionCoverUrl: string
}

const title = ref(props.initialTitle || '')
const authors = ref<Array<{ name: string }>>([])
const authorInput = ref('')
const authorCountry = ref('')
const firstPublishedYear = ref<number | null>(null)
const originalLanguage = ref('')
const genreIds = ref<number[]>([])
const seriesName = ref('')
const seriesNumber = ref('')

const showMoreDetails = ref(false)
const showEdition = ref(false)

const editionIsbn = ref('')
const editionPublisher = ref('')
const editionPageCount = ref<number | null>(null)
const editionPublishedYear = ref<number | null>(null)
const editionLanguage = ref('')
const editionCoverUrl = ref('')
const previewCoverUrl = ref('')

const submitting = ref(false)
const serverError = ref('')
const savedWorkHref = ref<string | null>(null)
const errors = ref<Record<string, string>>({})
let draftReady = false
let draftPersistenceEnabled = initialDraftKey !== null

const formDraft = useFormDraft<AddBookDraft>({
  key: initialDraftKey,
  snapshot: () => ({
    title: title.value,
    authors: authors.value,
    authorInput: authorInput.value,
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
  }),
})

interface DuplicateWorkState {
  id: string
  slug: string
  title: string
  cover_url?: string | null
}
const duplicateWork = ref<DuplicateWorkState | null>(null)

const FIELD_ORDER = [
  'title',
  'authors',
  'first_published_year',
  'author_country',
  'page_count',
  'published_year',
  'cover_url',
] as const
type FieldKey = typeof FIELD_ORDER[number]
const FIELD_LABELS: Record<FieldKey, string> = {
  title: 'Título',
  authors: 'Autor',
  first_published_year: 'Ano da 1ª publicação',
  author_country: 'País do autor',
  page_count: 'Número de páginas',
  published_year: 'Ano desta edição',
  cover_url: 'URL da capa',
}
const FIELD_INPUT_IDS: Record<FieldKey, string> = {
  title: 'book-title',
  authors: 'author-input',
  first_published_year: 'work-year',
  author_country: 'author-country',
  page_count: 'edition-pages',
  published_year: 'edition-year',
  cover_url: 'edition-cover-url',
}
const invalidFields = computed(() => FIELD_ORDER.filter((key) => errors.value[key]))

async function focusField(key: FieldKey): Promise<void> {
  if (key === 'first_published_year' || key === 'author_country') showMoreDetails.value = true
  if (key === 'page_count' || key === 'published_year' || key === 'cover_url') showEdition.value = true
  await nextTick()
  const el = document.getElementById(FIELD_INPUT_IDS[key])
  if (!el) return
  el.focus({ preventScroll: true })
  const reduce = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView?.({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
}

async function focusFirstInvalid(): Promise<void> {
  const first = invalidFields.value[0]
  if (first) await focusField(first)
}

watch(title, () => {
  if (errors.value.title) validateField('title')
})

function addAuthor(name: string): void {
  const trimmed = name.trim()
  if (!trimmed) return

  const exists = authors.value.some((author) => (
    author.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase()
  ))
  if (exists) return
  if (authors.value.length >= 5) {
    errors.value.authors = 'No máximo 5 autores são permitidos.'
    return
  }

  authors.value.push({ name: trimmed })
  delete errors.value.authors
}

function removeAuthor(index: number): void {
  authors.value.splice(index, 1)
  if (authors.value.length === 0) {
    errors.value.authors = 'Adicione pelo menos um autor.'
  }
}

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

const draftRestored = ref(false)

function recordOf(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseAddBookDraft(value: unknown): AddBookDraft | null {
  const draft = recordOf(value)
  if (!draft || !Array.isArray(draft.authors) || !Array.isArray(draft.genreIds)) return null

  const parsedAuthors: AddBookDraft['authors'] = []
  for (const valueAuthor of draft.authors as unknown[]) {
    const author = recordOf(valueAuthor)
    if (!author || typeof author.name !== 'string') return null
    parsedAuthors.push({ name: author.name })
  }

  return {
    title: typeof draft.title === 'string' ? draft.title : '',
    authors: parsedAuthors,
    authorInput: typeof draft.authorInput === 'string' ? draft.authorInput : '',
    authorCountry: typeof draft.authorCountry === 'string' ? draft.authorCountry : '',
    firstPublishedYear: nullableNumber(draft.firstPublishedYear),
    originalLanguage: typeof draft.originalLanguage === 'string' ? draft.originalLanguage : '',
    genreIds: (draft.genreIds as unknown[]).filter((id): id is number => (
      typeof id === 'number' && Number.isInteger(id)
    )),
    seriesName: typeof draft.seriesName === 'string' ? draft.seriesName : '',
    seriesNumber: typeof draft.seriesNumber === 'string' ? draft.seriesNumber : '',
    showMoreDetails: draft.showMoreDetails === true,
    showEdition: draft.showEdition === true,
    editionIsbn: typeof draft.editionIsbn === 'string' ? draft.editionIsbn : '',
    editionPublisher: typeof draft.editionPublisher === 'string' ? draft.editionPublisher : '',
    editionPageCount: nullableNumber(draft.editionPageCount),
    editionPublishedYear: nullableNumber(draft.editionPublishedYear),
    editionLanguage: typeof draft.editionLanguage === 'string' ? draft.editionLanguage : '',
    editionCoverUrl: typeof draft.editionCoverUrl === 'string' ? draft.editionCoverUrl : '',
  }
}

function draftHasContent(draft: AddBookDraft): boolean {
  return Boolean(
    (!props.initialTitle && draft.title.trim())
    || draft.authors.length
    || draft.authorInput.trim()
    || draft.authorCountry.trim()
    || draft.firstPublishedYear !== null
    || draft.originalLanguage
    || draft.genreIds.length
    || draft.seriesName.trim()
    || draft.seriesNumber.trim()
    || draft.editionIsbn.trim()
    || draft.editionPublisher.trim()
    || draft.editionPageCount !== null
    || draft.editionPublishedYear !== null
    || draft.editionLanguage
    || draft.editionCoverUrl.trim(),
  )
}

function restoreDraft(): boolean {
  const draft = formDraft.restore(parseAddBookDraft)
  if (!draft) return false
  if (!props.initialTitle) title.value = draft.title
  authors.value = draft.authors
  authorInput.value = draft.authorInput
  authorCountry.value = draft.authorCountry
  firstPublishedYear.value = draft.firstPublishedYear
  originalLanguage.value = draft.originalLanguage
  genreIds.value = draft.genreIds
  seriesName.value = draft.seriesName
  seriesNumber.value = draft.seriesNumber
  showMoreDetails.value = draft.showMoreDetails
  showEdition.value = draft.showEdition
  editionIsbn.value = draft.editionIsbn
  editionPublisher.value = draft.editionPublisher
  editionPageCount.value = draft.editionPageCount
  editionPublishedYear.value = draft.editionPublishedYear
  editionLanguage.value = draft.editionLanguage
  editionCoverUrl.value = draft.editionCoverUrl
  previewCoverUrl.value = draft.editionCoverUrl.trim()
  return draftHasContent(draft)
}

function clearDraft(): void {
  draftReady = false
  draftRestored.value = false
  if (draftPersistenceEnabled) formDraft.clear()
  else formDraft.cancel()
}

watch(
  () => currentDraftKey(),
  (key) => {
    if (key !== initialDraftKey) {
      draftPersistenceEnabled = false
      draftReady = false
      formDraft.cancel()
    }
  },
  { flush: 'sync' },
)

watch(
  [
    title,
    authors,
    authorInput,
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
    if (draftReady && draftPersistenceEnabled && !savedWorkHref.value) formDraft.schedule()
  },
  { deep: true },
)

onMounted(() => {
  draftRestored.value = restoreDraft()
  if (props.initialTitle) title.value = props.initialTitle
  void nextTick(() => {
    draftReady = draftPersistenceEnabled
  })
})

async function discardDraft(): Promise<void> {
  draftReady = false
  title.value = props.initialTitle || ''
  authors.value = []
  authorInput.value = ''
  authorCountry.value = ''
  firstPublishedYear.value = null
  originalLanguage.value = ''
  genreIds.value = []
  seriesName.value = ''
  seriesNumber.value = ''
  showMoreDetails.value = false
  showEdition.value = false
  editionIsbn.value = ''
  editionPublisher.value = ''
  editionPageCount.value = null
  editionPublishedYear.value = null
  editionLanguage.value = ''
  editionCoverUrl.value = ''
  previewCoverUrl.value = ''
  errors.value = {}
  serverError.value = ''
  draftRestored.value = false
  clearDraft()
  await nextTick()
  draftReady = draftPersistenceEnabled
  document.getElementById('book-title')?.focus()
}

async function handleSubmit(force = false): Promise<void> {
  if (submitting.value || savedWorkHref.value) return
  if (authorInput.value.trim() && authors.value.length < 5) {
    addAuthor(authorInput.value)
    authorInput.value = ''
  }

  if (!validateAll()) {
    await focusFirstInvalid()
    return
  }

  submitting.value = true
  serverError.value = ''
  duplicateWork.value = null

  const rawCountryLabel = authorCountry.value.trim() || null
  const countryCode = countryCodeFor(rawCountryLabel)
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
      timeout: 15_000,
      body: payload,
    })

    const target = props.returnTo || '/app/novo'
    const sep = target.includes('?') ? '&' : '?'
    savedWorkHref.value = `${target}${sep}work_id=${res.id}`
    clearDraft()
    emit('success', res)
    try {
      const navigation = await navigateTo(savedWorkHref.value)
      if (navigation) {
        serverError.value = 'O livro foi cadastrado, mas não foi possível voltar à leitura. Use o link abaixo.'
      }
    } catch {
      serverError.value = 'O livro foi cadastrado, mas não foi possível voltar à leitura. Use o link abaixo.'
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
  if (!duplicateWork.value || submitting.value || savedWorkHref.value) return
  const target = props.returnTo || '/app/novo'
  const sep = target.includes('?') ? '&' : '?'
  savedWorkHref.value = `${target}${sep}work_id=${duplicateWork.value.id}`
  submitting.value = true
  serverError.value = ''
  formDraft.flush()
  try {
    const navigation = await navigateTo(savedWorkHref.value)
    if (navigation) {
      savedWorkHref.value = null
      serverError.value = 'Não foi possível abrir a leitura com esta obra. Seu rascunho foi mantido.'
      return
    }
    clearDraft()
  } catch {
    savedWorkHref.value = null
    serverError.value = 'Não foi possível abrir a leitura com esta obra. Seu rascunho foi mantido.'
  } finally {
    submitting.value = false
  }
}

async function forceCreateWork(): Promise<void> {
  await handleSubmit(true)
}

async function handleCancel(): Promise<void> {
  if (submitting.value || savedWorkHref.value) return
  emit('cancel')
  if (props.returnTo) {
    submitting.value = true
    try {
      const navigation = await navigateTo(props.returnTo)
      if (navigation) serverError.value = 'Não foi possível voltar. Seu rascunho foi mantido.'
    } catch {
      serverError.value = 'Não foi possível voltar. Seu rascunho foi mantido.'
    } finally {
      submitting.value = false
    }
  }
}
</script>

<style scoped>
.add-book-form-wrap {
  width: 100%;
}

.duplicate-prompt {
  background-color: var(--highlight-soft);
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
  color: var(--text-strong);
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

.form-header {
  margin-bottom: var(--space-6);
}

.form-title {
  color: var(--text-strong);
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

.saved-work-link {
  display: inline-flex;
  margin: 0 0 var(--space-4);
  color: var(--highlight);
  font-size: var(--font-size-sm);
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.form-group {
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

.required-indicator {
  color: var(--highlight);
  margin-left: 2px;
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

.draft-notice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  margin: 0 0 var(--space-4);
  font-size: var(--font-size-sm);
  color: var(--text-color);
}

.error-summary {
  margin-top: var(--space-6);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--danger);
  border-radius: var(--radius-sm);
  color: var(--text-bright);
  font-size: var(--font-size-sm);
}

.error-summary + .form-actions {
  margin-top: var(--space-4);
}

.draft-discard-btn,
.error-summary-link {
  background: transparent;
  border: none;
  padding: var(--space-1) 0;
  margin: 0 2px;
  display: inline-block;
  min-height: 24px;
  color: var(--text-bright);
  font: inherit;
  text-decoration: underline;
  text-decoration-color: var(--highlight);
  text-decoration-thickness: 2px;
  text-underline-offset: 0.25em;
  cursor: pointer;
}

.error-summary:focus-visible,
.draft-discard-btn:focus-visible,
.error-summary-link:focus-visible {
  outline: 2px solid var(--highlight);
  outline-offset: 2px;
}

@media (pointer: coarse) {
  .draft-discard-btn {
    min-height: var(--target-min-size);
  }
}

.form-actions {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-6);
  padding-top: var(--space-4);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.btn-submit {
  flex: 1;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: var(--text-strong);
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
  .disclosure-toggle {
    transition: none;
  }
}
</style>
