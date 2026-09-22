<template>
  <div class="log-form-wrap">
    <!-- Step 1: Book Selection (if creating and no work chosen yet) -->
    <div v-if="!selectedWork" class="book-selection-section">
      <span class="form-label mb-2">Buscar livro</span>
      <p class="section-hint">
        Digite o título do livro ou nome do autor para selecionar do catálogo.
      </p>
      <SearchBox
        :navigate-on-select="false"
        @select="onWorkSelected"
      />
    </div>

    <!-- Step 2: Book Details & Reading Log Form -->
    <div v-else class="log-form-content">
      <!-- Selected Book Card Header -->
      <div class="selected-book-banner">
        <div class="selected-book-cover">
          <BookCover
            :alt="`Capa de ${selectedWork.title}, de ${formatAuthors(selectedWork.authors)}`"
            :title="selectedWork.title"
            :cover-url="selectedWork.cover_url"
            :ol-cover-id="selectedWork.ol_cover_id"
          />
        </div>
        <div class="selected-book-meta">
          <h2 class="book-title">{{ selectedWork.title }}</h2>
          <p class="book-authors">
            {{ formatAuthors(selectedWork.authors) }}
          </p>
          <span v-if="selectedWork.first_published_year" class="book-year">
            {{ selectedWork.first_published_year }}
          </span>
          <button
            v-if="mode === 'create'"
            type="button"
            class="change-book-btn"
            @click="changeBook"
          >
            ← Trocar livro
          </button>
        </div>
      </div>

      <form class="log-form" @submit.prevent="handleSubmit">
        <!-- Currently Reading Toggle -->
        <div class="form-group reading-status-group">
          <label class="status-checkbox-label">
            <input
              v-model="isCurrentlyReading"
              type="checkbox"
              class="status-checkbox"
              :disabled="submitting || deleting"
            >
            <span class="status-checkbox-content">
              <span class="status-checkbox-title">Estou lendo este livro atualmente</span>
              <span class="status-checkbox-desc">Deixe a data de término em aberto e acompanhe o progresso da leitura por trechos.</span>
            </span>
          </label>
        </div>

        <!-- Rating -->
        <div v-if="!isCurrentlyReading" class="form-group">
          <span id="log-rating-label" class="form-label">Sua avaliação</span>
          <RatingInput
            v-model="rating"
            :disabled="submitting || deleting"
          />
        </div>

        <!-- Finished date & precision -->
        <div v-if="!isCurrentlyReading" class="form-row">
          <div class="form-group flex-1">
            <label for="log-finished-on" class="form-label">Data de término</label>
            <input
              id="log-finished-on"
              v-model="finishedOn"
              type="date"
              class="form-input"
              :disabled="submitting || deleting"
              aria-describedby="log-finished-hint"
            >
            <span id="log-finished-hint" class="field-hint">Preenchida com a data de hoje pelo seu navegador.</span>
          </div>

          <div class="form-group">
            <label for="log-precision" class="form-label">Precisão</label>
            <select
              id="log-precision"
              v-model="finishedPrecision"
              class="form-input form-select"
              :disabled="submitting || deleting"
            >
              <option value="dia">Dia exato</option>
              <option value="mes">Mês</option>
              <option value="ano">Apenas ano</option>
            </select>
          </div>
        </div>

        <!-- Optional start date -->
        <div class="form-group">
          <button
            type="button"
            class="toggle-link-btn"
            :aria-expanded="showStartDate"
            aria-controls="start-date-input-wrap"
            @click="showStartDate = !showStartDate"
          >
            {{ showStartDate ? '− Ocultar data de início' : '+ Adicionar data de início' }}
          </button>
          <div v-if="showStartDate" id="start-date-input-wrap" class="start-date-input-wrap">
            <label for="log-started-on" class="form-label">Data de início</label>
            <input
              id="log-started-on"
              v-model="startedOn"
              type="date"
              class="form-input"
              :disabled="submitting || deleting"
            >
          </div>
        </div>

        <!-- Review (Plain text, max 10,000) -->
        <div class="form-group">
          <div class="label-row">
            <label for="log-review" class="form-label">Resenha (opcional)</label>
            <span class="char-count" :class="{ 'char-count-limit': review.length > 10000 }">
              {{ review.length }} / 10.000
            </span>
          </div>
          <textarea
            id="log-review"
            v-model="review"
            maxlength="10000"
            rows="6"
            placeholder="O que você achou do livro? Escreva suas impressões..."
            class="form-input form-textarea"
            :disabled="submitting || deleting"
            aria-describedby="log-review-hint"
          />
          <span id="log-review-hint" class="field-hint">Texto puro. Quebras de linha são preservadas.</span>
        </div>

        <!-- Format: Físico, Ebook, Áudio -->
        <div class="form-group">
          <span id="log-format-label" class="form-label">Formato</span>
          <div class="format-buttons" role="group" aria-labelledby="log-format-label">
            <button
              type="button"
              class="format-btn"
              :class="{ 'is-selected': format === 'fisico' }"
              :aria-pressed="format === 'fisico'"
              :disabled="submitting || deleting"
              @click="toggleFormat('fisico')"
            >
              Físico
            </button>
            <button
              type="button"
              class="format-btn"
              :class="{ 'is-selected': format === 'ebook' }"
              :aria-pressed="format === 'ebook'"
              :disabled="submitting || deleting"
              @click="toggleFormat('ebook')"
            >
              Ebook
            </button>
            <button
              type="button"
              class="format-btn"
              :class="{ 'is-selected': format === 'audio' }"
              :aria-pressed="format === 'audio'"
              :disabled="submitting || deleting"
              @click="toggleFormat('audio')"
            >
              Áudio
            </button>
          </div>
        </div>

        <!-- Edition Picker (collapsed by default) -->
        <div class="form-group">
          <button
            type="button"
            class="toggle-link-btn"
            :aria-expanded="showEditionPicker"
            aria-controls="edition-picker-panel"
            @click="toggleEditionPicker"
          >
            {{ showEditionPicker ? '− Fechar edição' : 'li outra edição?' }}
          </button>

          <div v-if="showEditionPicker" id="edition-picker-panel" class="edition-picker-panel">
            <p v-if="loadingEditions" class="field-hint">Carregando edições…</p>
            <div v-else-if="editionsList.length > 0" class="edition-options">
              <label class="edition-option" :class="{ 'is-selected': editionId === null }">
                <input
                  v-model="editionId"
                  type="radio"
                  name="edition"
                  :value="null"
                  :disabled="submitting || deleting"
                >
                <div class="edition-info">
                  <span class="edition-title">Edição padrão do catálogo</span>
                </div>
              </label>

              <label
                v-for="ed in editionsList"
                :key="ed.id"
                class="edition-option"
                :class="{ 'is-selected': editionId === ed.id }"
              >
                <input
                  v-model="editionId"
                  type="radio"
                  name="edition"
                  :value="ed.id"
                  :disabled="submitting || deleting"
                >
                <div class="edition-info">
                  <span class="edition-title">
                    {{ ed.publisher ? ed.publisher : 'Editora não informada' }}
                    <span v-if="ed.published_year">({{ ed.published_year }})</span>
                  </span>
                  <span v-if="ed.isbn13" class="edition-meta">ISBN: {{ ed.isbn13 }}</span>
                  <span v-if="ed.page_count" class="edition-meta">{{ ed.page_count }} páginas</span>
                </div>
              </label>
            </div>
            <p v-else class="field-hint">
              Nenhuma outra edição cadastrada para esta obra.
            </p>
          </div>
        </div>

        <!-- Visibility Toggle -->
        <fieldset class="form-group visibility-fieldset">
          <legend class="form-label">Visibilidade</legend>
          <div class="visibility-options">
            <label class="radio-card" :class="{ selected: visibility === 'publico' }">
              <input
                v-model="visibility"
                type="radio"
                name="log-visibility"
                value="publico"
                :disabled="submitting || deleting"
                class="radio-input"
              >
              <div class="radio-text">
                <span class="radio-title">Público</span>
                <span class="radio-desc">Qualquer pessoa com o link pode ver.</span>
              </div>
            </label>

            <label class="radio-card" :class="{ selected: visibility === 'privado' }">
              <input
                v-model="visibility"
                type="radio"
                name="log-visibility"
                value="privado"
                :disabled="submitting || deleting"
                class="radio-input"
              >
              <div class="radio-text">
                <span class="radio-title">Privado</span>
                <span class="radio-desc">Só você pode ver este registro.</span>
              </div>
            </label>
          </div>
        </fieldset>

        <!-- Error Message -->
        <p v-if="errorMessage" id="log-form-error" class="error-message" role="alert">
          {{ errorMessage }}
        </p>

        <!-- Form Actions -->
        <div class="form-actions">
          <button
            type="submit"
            class="submit-btn"
            :disabled="submitting || deleting || review.length > 10000"
          >
            <span v-if="submitting" class="spinner" aria-hidden="true" />
            <span>{{ submitButtonLabel }}</span>
          </button>

          <button
            v-if="mode === 'edit'"
            type="button"
            class="delete-btn"
            :disabled="submitting || deleting"
            @click="handleDelete"
          >
            {{ deleting ? 'Removendo...' : 'Remover da biblioteca' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { isTimeoutOrAbort, TIMEOUT_MESSAGE } from '~/utils/fetch-error'
import { computed, onMounted, ref, watch } from 'vue'
import BookCover from '../book/BookCover.vue'
import RatingInput from '../book/RatingInput.vue'
import SearchBox from '../search/SearchBox.vue'
import type { LogEditionView as LogEdition, LogWithDetails } from '~~/shared/schemas/log'
import type { SearchResult } from '~~/shared/schemas/search'

const props = withDefaults(
  defineProps<{
    mode?: 'create' | 'edit'
    initialLog?: LogWithDetails | null
    initialWork?: SearchResult | null
  }>(),
  {
    mode: 'create',
    initialLog: null,
    initialWork: null,
  },
)

const DRAFT_KEY = 'meus-livros:log-draft'

/** Computes current browser local date in YYYY-MM-DD */
function getBrowserLocalDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Form state
interface SelectedWorkState {
  id: string
  title: string
  slug: string
  authors: Array<{ name: string; slug?: string }>
  first_published_year?: number | null
  cover_url?: string | null
  ol_cover_id?: number | null
}

const selectedWork = ref<SelectedWorkState | null>(null)
const editionId = ref<string | null>(null)
const isCurrentlyReading = ref(false)
const rating = ref<number | null>(null)
const review = ref('')
const finishedOn = ref(getBrowserLocalDate())
const startedOn = ref('')
const finishedPrecision = ref<'dia' | 'mes' | 'ano'>('dia')
const format = ref<'fisico' | 'ebook' | 'audio' | null>(null)
const visibility = ref<'publico' | 'privado'>('publico')

const showStartDate = ref(false)
const showEditionPicker = ref(false)
const editionsList = ref<LogEdition[]>([])
const loadingEditions = ref(false)

const submitting = ref(false)
const deleting = ref(false)
const errorMessage = ref('')

const submitButtonLabel = computed(() => {
  if (submitting.value) return 'Salvando...'
  return props.mode === 'edit' ? 'Salvar alterações' : 'Registrar livro'
})

function formatAuthors(authors?: Array<{ name: string }>): string {
  if (!authors || authors.length === 0) return 'Autor desconhecido'
  return authors.map((a) => a.name).join(', ')
}

function toggleFormat(val: 'fisico' | 'ebook' | 'audio'): void {
  format.value = format.value === val ? null : val
}

function onWorkSelected(work: SearchResult): void {
  if (!work.id || !work.slug) return
  selectedWork.value = {
    id: work.id,
    title: work.title,
    slug: work.slug,
    authors: work.authors,
    first_published_year: work.first_published_year,
    cover_url: work.cover_url,
    ol_cover_id: work.ol_cover_id,
  }
  editionId.value = null
  editionsList.value = []
  showEditionPicker.value = false
  saveDraft()
}

function changeBook(): void {
  selectedWork.value = null
  editionId.value = null
  editionsList.value = []
  showEditionPicker.value = false
  saveDraft()
}

async function toggleEditionPicker(): Promise<void> {
  showEditionPicker.value = !showEditionPicker.value
  if (showEditionPicker.value && selectedWork.value && editionsList.value.length === 0) {
    loadingEditions.value = true
    try {
      const res = await $fetch<{ editions: LogEdition[] }>(
        `/api/works/${selectedWork.value.id}/editions`,
        {
          timeout: 15_000,
          // ofetch retries non-payload methods once, which would make the
          // effective wait 30s. The point here is a bound, not a retry.
          retry: 0,
        },
      )
      editionsList.value = res.editions
    } catch {
      // Catalog enrichment fallback. Stays silent on purpose, timeout included:
      // errorMessage is the submit slot, and an optional edition lookup must not
      // write there -- it would overwrite a real save error.
    } finally {
      loadingEditions.value = false
    }
  }
}

// ---------------------------------------------------------------------------
// Draft Persistence (Requirement 10)
// ---------------------------------------------------------------------------
function saveDraft(): void {
  if (props.mode !== 'create') return
  try {
    const draft = {
      work: selectedWork.value,
      editionId: editionId.value,
      rating: rating.value,
      review: review.value,
      finishedOn: finishedOn.value,
      startedOn: startedOn.value,
      finishedPrecision: finishedPrecision.value,
      format: format.value,
      visibility: visibility.value,
      showStartDate: showStartDate.value,
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // Gracefully handle private browsing / storage disabled
  }
}

function restoreDraft(): void {
  if (props.mode !== 'create') return
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return
    const draft = JSON.parse(raw)
    if (draft.work) selectedWork.value = draft.work
    if (draft.editionId !== undefined) editionId.value = draft.editionId
    if (draft.rating !== undefined) rating.value = draft.rating
    if (draft.review !== undefined) review.value = draft.review
    if (draft.finishedOn !== undefined && draft.finishedOn) finishedOn.value = draft.finishedOn
    if (draft.startedOn !== undefined) startedOn.value = draft.startedOn
    if (draft.finishedPrecision !== undefined) finishedPrecision.value = draft.finishedPrecision
    if (draft.format !== undefined) format.value = draft.format
    if (draft.visibility !== undefined) visibility.value = draft.visibility
    if (draft.showStartDate !== undefined) showStartDate.value = draft.showStartDate
    else if (draft.startedOn) showStartDate.value = true
  } catch {
    // Gracefully ignore corrupt draft
  }
}

function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // Ignore
  }
}

// Watch inputs to persist draft in create mode
watch(
  [
    selectedWork,
    editionId,
    rating,
    review,
    finishedOn,
    startedOn,
    finishedPrecision,
    format,
    visibility,
    showStartDate,
  ],
  () => {
    saveDraft()
  },
  { deep: true },
)

// Initialize from props or draft
onMounted(() => {
  if (props.mode === 'edit' && props.initialLog) {
    const log = props.initialLog
    selectedWork.value = {
      id: log.work.id,
      title: log.work.title,
      slug: log.work.slug,
      authors: log.work.authors,
      first_published_year: log.work.first_published_year,
      cover_url: log.work.cover_url,
    }
    editionId.value = log.edition_id
    rating.value = log.rating
    review.value = log.review ?? ''
    finishedOn.value = log.finished_on ?? getBrowserLocalDate()
    startedOn.value = log.started_on ?? ''
    showStartDate.value = Boolean(log.started_on)
    finishedPrecision.value = log.finished_precision
    format.value = log.format
    visibility.value = log.visibility
    isCurrentlyReading.value = !log.finished_on
  } else {
    if (props.initialWork && props.initialWork.id && props.initialWork.slug) {
      selectedWork.value = {
        id: props.initialWork.id,
        title: props.initialWork.title,
        slug: props.initialWork.slug,
        authors: props.initialWork.authors,
        first_published_year: props.initialWork.first_published_year,
        cover_url: props.initialWork.cover_url,
      }
    }
    restoreDraft()
  }
})

// ---------------------------------------------------------------------------
// Form Submission & Deletion
// ---------------------------------------------------------------------------
async function handleSubmit(): Promise<void> {
  if (!selectedWork.value) {
    errorMessage.value = 'Selecione uma obra para registrar.'
    return
  }

  errorMessage.value = ''
  submitting.value = true

  const payload = {
    work_id: selectedWork.value.id,
    edition_id: editionId.value || undefined,
    rating: isCurrentlyReading.value ? null : (rating.value != null ? rating.value : undefined),
    review: review.value ? review.value : undefined,
    started_on: isCurrentlyReading.value
      ? (startedOn.value || getBrowserLocalDate())
      : (showStartDate.value && startedOn.value ? startedOn.value : undefined),
    finished_on: isCurrentlyReading.value ? null : (finishedOn.value || undefined),
    finished_precision: finishedPrecision.value,
    format: format.value || undefined,
    visibility: visibility.value,
  }

  try {
    if (props.mode === 'edit' && props.initialLog) {
      await $fetch(`/api/logs/${props.initialLog.id}`, {
        method: 'PATCH',
        // Without a timeout this promise can never settle: a request lost
        // without the server answering or closing leaves `finally` unreached,
        // `submitting` stuck true, and the button reading "Salvando..." forever
        // with no error and no way out but a reload. Observed in the wild.
        timeout: 15_000,
        body: payload,
      })
      void navigateTo(`/entrada/${props.initialLog.id}`)
    } else {
      const res = await $fetch<{ id: string }>('/api/logs', {
        method: 'POST',
        timeout: 15_000,
        body: payload,
      })
      clearDraft()
      void navigateTo(`/entrada/${res.id}`)
    }
  } catch (err: unknown) {
    if (isTimeoutOrAbort(err)) {
      errorMessage.value = TIMEOUT_MESSAGE
      return
    }
    // Retain typed input — NEVER clear on failed save!
    const fetchErr = err as { data?: { message?: string } }
    errorMessage.value = fetchErr.data?.message ?? 'Não foi possível salvar o registro de leitura.'
  } finally {
    submitting.value = false
  }
}

async function handleDelete(): Promise<void> {
  if (!props.initialLog) return
  if (!confirm('Tem certeza que deseja remover este livro da sua biblioteca? Esta ação não pode ser desfeita.')) {
    return
  }

  deleting.value = true
  errorMessage.value = ''

  try {
    await $fetch(`/api/logs/${props.initialLog.id}`, {
      method: 'DELETE',
      timeout: 15_000,
    })
    const dest = props.initialLog.user?.handle ? `/@${props.initialLog.user.handle}` : '/'
    void navigateTo(dest)
  } catch (err: unknown) {
    if (isTimeoutOrAbort(err)) {
      errorMessage.value = TIMEOUT_MESSAGE
      return
    }
    const fetchErr = err as { data?: { message?: string } }
    errorMessage.value = fetchErr.data?.message ?? 'Não foi possível remover o livro da biblioteca.'
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.log-form-wrap {
  width: 100%;
}

.book-selection-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.section-hint {
  color: var(--text-color);
  font-size: var(--font-size-sm);
  margin: 0 0 var(--space-3) 0;
}

.selected-book-banner {
  display: flex;
  gap: var(--space-4);
  background-color: var(--input-bg);
  padding: var(--space-4);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-6);
  align-items: center;
}

.selected-book-cover {
  width: 70px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

.selected-book-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.book-title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: #fff;
  margin: 0;
  line-height: var(--line-height-tight);
}

.book-authors {
  font-size: var(--font-size-sm);
  color: var(--text-color);
  margin: 0;
}

.book-year {
  font-size: var(--font-size-xs);
  color: var(--text-color);
  opacity: 0.8;
}

.change-book-btn {
  background: transparent;
  border: none;
  color: var(--highlight);
  font-size: var(--font-size-xs);
  padding: 4px 0;
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  margin-top: var(--space-1);
  cursor: pointer;
  text-align: left;
}

.change-book-btn:hover {
  text-decoration: underline;
}

.change-book-btn:focus-visible {
  outline: 2px solid var(--highlight);
  outline-offset: 2px;
}

.log-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.form-row {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
}

.flex-1 {
  flex: 1;
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.form-label {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: #fff;
}

.char-count {
  font-size: var(--font-size-xs);
  color: var(--text-color);
}

.char-count-limit {
  color: var(--danger);
  font-weight: bold;
}

.field-hint {
  font-size: var(--font-size-xs);
  color: var(--text-color);
  margin: 0;
}

.form-input {
  background-color: var(--input-bg);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  padding: var(--space-3);
  color: #fff;
  font-size: var(--font-size-base);
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
}

.form-input:focus {
  border-color: var(--highlight);
  box-shadow: 0 0 0 2px rgba(64, 188, 244, 0.2);
}

.form-select {
  cursor: pointer;
}

.form-textarea {
  resize: vertical;
  min-height: 120px;
  line-height: var(--line-height-normal);
}

.toggle-link-btn {
  background: transparent;
  border: none;
  color: var(--highlight);
  font-size: var(--font-size-sm);
  cursor: pointer;
  padding: 4px 0;
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  text-align: left;
}

.toggle-link-btn:hover {
  text-decoration: underline;
}

.toggle-link-btn:focus-visible {
  outline: 2px solid var(--highlight);
  outline-offset: 2px;
}

.start-date-input-wrap {
  margin-top: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.format-buttons {
  display: flex;
  gap: var(--space-2);
}

.format-btn {
  flex: 1;
  background-color: var(--input-bg);
  color: var(--text-color);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  padding: var(--space-3);
  font-size: var(--font-size-sm);
  font-weight: 500;
  min-height: 44px;
  cursor: pointer;
  transition: all 0.15s;
}

.format-btn:hover {
  border-color: rgba(255, 255, 255, 0.2);
}

.format-btn.is-selected {
  background-color: rgba(64, 188, 244, 0.15);
  border-color: var(--highlight);
  color: #fff;
}

.format-btn:focus-visible {
  outline: 2px solid var(--highlight);
  outline-offset: 2px;
}

.edition-picker-panel {
  background-color: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--input-bg);
  border-radius: var(--radius-sm);
  padding: var(--space-3);
  margin-top: var(--space-2);
}

.edition-options {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.edition-option {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background-color: var(--input-bg);
  cursor: pointer;
  border: 1px solid transparent;
}

.edition-option.is-selected {
  border-color: var(--highlight);
}

.edition-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.edition-title {
  font-size: var(--font-size-sm);
  color: #fff;
}

.edition-meta {
  font-size: var(--font-size-xs);
  color: var(--text-color);
}

.visibility-fieldset {
  border: none;
  padding: 0;
  margin: 0;
}

.visibility-options {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.radio-card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  background-color: var(--input-bg);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  padding: var(--space-3) var(--space-4);
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s;
  min-height: 44px;
  box-sizing: border-box;
}

.radio-card.selected {
  border-color: var(--highlight);
  background-color: rgba(64, 188, 244, 0.08);
}

.radio-input {
  margin-top: 3px;
  accent-color: var(--highlight);
}

.radio-input:focus-visible {
  outline: 2px solid var(--highlight);
  outline-offset: 2px;
}

.radio-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.radio-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: #fff;
}

.radio-desc {
  font-size: var(--font-size-xs);
  color: var(--text-color);
  line-height: var(--line-height-tight);
}

.error-message {
  color: var(--danger);
  font-size: var(--font-size-sm);
  margin: 0;
}

.form-actions {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  margin-top: var(--space-2);
}

.submit-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  background-color: var(--highlight);
  color: #14181c;
  border: none;
  border-radius: var(--radius-sm);
  padding: var(--space-3);
  font-size: var(--font-size-base);
  font-weight: bold;
  cursor: pointer;
  min-height: 44px;
  box-sizing: border-box;
  transition: opacity 0.2s;
}

.submit-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.submit-btn:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}

.delete-btn {
  background: transparent;
  color: var(--danger);
  border: 1px solid var(--danger);
  border-radius: var(--radius-sm);
  padding: var(--space-3) var(--space-4);
  font-size: var(--font-size-sm);
  font-weight: 600;
  min-height: 44px;
  box-sizing: border-box;
  cursor: pointer;
  transition: background-color 0.15s;
}

.delete-btn:hover:not(:disabled) {
  background-color: rgba(239, 68, 68, 0.1);
}

.delete-btn:focus-visible {
  outline: 2px solid var(--danger);
  outline-offset: 2px;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(0, 0, 0, 0.2);
  border-top-color: #14181c;
  border-radius: var(--radius-full);
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation-duration: 1.5s;
  }
  .submit-btn,
  .delete-btn,
  .format-btn,
  .form-input,
  .radio-card {
    transition: none;
  }
}

.reading-status-group {
  margin-bottom: var(--space-4);
  padding: var(--space-3);
  background-color: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--input-bg);
  border-radius: var(--radius-md);
}

.status-checkbox-label {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  cursor: pointer;
}

.status-checkbox {
  margin-top: 3px;
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--highlight);
}

.status-checkbox-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.status-checkbox-title {
  color: #fff;
  font-size: var(--font-size-sm);
  font-weight: 500;
}

.status-checkbox-desc {
  color: var(--text-color);
  font-size: var(--font-size-xs);
  opacity: 0.8;
}
</style>
