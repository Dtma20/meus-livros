<template>
  <div class="log-form-wrap">
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

    <div v-else class="log-form-content">
      <div class="selected-book-banner">
        <div class="selected-book-cover">
          <BookCover
            :alt="`Capa de ${selectedWork.title}, de ${formatAuthors(selectedWork.authors)}`"
            :title="selectedWork.title"
            :cover-url="selectedWork.cover_url"
            :ol-cover-id="selectedWork.ol_cover_id"
            :isbn13="selectedWork.isbn13"
            size="small"
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
            v-if="mode === 'create' && !disableChangeBook"
            type="button"
            class="change-book-btn"
            :disabled="submitting || creatingEdition || Boolean(savedLogHref)"
            @click="changeBook"
          >
            ← Trocar livro
          </button>
        </div>
      </div>

      <p v-if="draftRestored" class="draft-notice" role="status" aria-live="polite">
        <span>Rascunho anterior restaurado.</span>
        <button type="button" class="draft-discard-btn" @click="discardDraft">
          Descartar rascunho
        </button>
      </p>

      <p v-if="finishingMode" class="finish-notice" role="status">
        Marque a nota e salve para concluir a leitura.
      </p>

      <form class="log-form" @submit.prevent="handleSubmit">
        <div class="form-group reading-status-group">
          <label class="status-checkbox-label">
            <input
              v-model="isCurrentlyReading"
              type="checkbox"
              class="status-checkbox"
              :disabled="submitting || Boolean(savedLogHref)"
            >
            <span class="status-checkbox-content">
              <span class="status-checkbox-title">Estou lendo este livro atualmente</span>
              <span class="status-checkbox-desc">Deixe a data de término em aberto e acompanhe o progresso da leitura por trechos.</span>
            </span>
          </label>
        </div>

        <div v-if="!isCurrentlyReading" id="log-rating-group" class="form-group">
          <span id="log-rating-label" class="form-label">Sua avaliação</span>
          <RatingInput
            v-model="rating"
            :disabled="submitting || Boolean(savedLogHref)"
            labelled-by="log-rating-label"
          />
        </div>

        <div v-if="!isCurrentlyReading" class="form-row">
          <div class="form-group flex-1">
            <label for="log-finished-on" class="form-label">Data de término</label>
            <input
              id="log-finished-on"
              v-model="finishedOn"
              type="date"
              class="form-input"
              :disabled="submitting || Boolean(savedLogHref)"
              :aria-invalid="fieldErrors.finished_on ? 'true' : undefined"
              :aria-describedby="describedBy('finished_on', showFinishedHint ? 'log-finished-hint' : undefined)"
            >
            <span v-if="fieldErrors.finished_on" id="log-finished-on-error" class="field-error">{{ fieldErrors.finished_on }}</span>
            <span v-if="showFinishedHint" id="log-finished-hint" class="field-hint">Preenchida com a data de hoje pelo seu navegador.</span>
          </div>

          <div class="form-group">
            <label for="log-precision" class="form-label">Precisão da data</label>
            <select
              id="log-precision"
              v-model="finishedPrecision"
              class="form-input form-select"
              :disabled="submitting || Boolean(savedLogHref)"
              aria-describedby="log-precision-hint"
            >
              <option value="dia">Dia exato</option>
              <option value="mes">Só o mês</option>
              <option value="ano">Só o ano</option>
            </select>
            <span id="log-precision-hint" class="field-hint">Use Só o mês ou Só o ano quando não lembrar o dia.</span>
          </div>
        </div>

        <div class="form-group">
          <button
            type="button"
            class="toggle-link-btn"
            :aria-expanded="showStartDate"
            aria-controls="start-date-input-wrap"
            :disabled="submitting || creatingEdition || Boolean(savedLogHref)"
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
              :disabled="submitting || Boolean(savedLogHref)"
              :aria-invalid="fieldErrors.started_on ? 'true' : undefined"
              :aria-describedby="describedBy('started_on')"
            >
            <span v-if="fieldErrors.started_on" id="log-started-on-error" class="field-error">{{ fieldErrors.started_on }}</span>
          </div>
        </div>

        <div class="form-group">
          <div class="label-row">
            <label for="log-review" class="form-label">Resenha (opcional)</label>
            <span id="log-review-count" class="char-count" :class="{ 'char-count-limit': review.length > 10000 }">
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
            :disabled="submitting || Boolean(savedLogHref)"
            :aria-invalid="fieldErrors.review ? 'true' : undefined"
            :aria-describedby="describedBy('review', 'log-review-hint')"
          />
          <span v-if="fieldErrors.review" id="log-review-error" class="field-error">{{ fieldErrors.review }}</span>
          <span id="log-review-hint" class="field-hint">Texto puro. Quebras de linha são preservadas.</span>
        </div>

        <div class="form-group">
          <span id="log-format-label" class="form-label">Formato</span>
          <div class="format-buttons" role="group" aria-labelledby="log-format-label">
            <button
              type="button"
              class="format-btn"
              :class="{ 'is-selected': format === 'fisico' }"
              :aria-pressed="format === 'fisico'"
              :disabled="submitting || Boolean(savedLogHref)"
              @click="toggleFormat('fisico')"
            >
              Físico
            </button>
            <button
              type="button"
              class="format-btn"
              :class="{ 'is-selected': format === 'ebook' }"
              :aria-pressed="format === 'ebook'"
              :disabled="submitting || Boolean(savedLogHref)"
              @click="toggleFormat('ebook')"
            >
              E-book
            </button>
            <button
              type="button"
              class="format-btn"
              :class="{ 'is-selected': format === 'audio' }"
              :aria-pressed="format === 'audio'"
              :disabled="submitting || Boolean(savedLogHref)"
              @click="toggleFormat('audio')"
            >
              Audiolivro
            </button>
          </div>
        </div>

        <div class="form-group">
          <div class="edition-toggle-row">
            <button
              type="button"
              class="toggle-link-btn"
              :aria-expanded="showEditionPicker"
              aria-controls="edition-picker-panel"
              :aria-describedby="showEditionPicker ? 'log-edition-hint' : 'log-edition-summary log-edition-hint'"
              :disabled="submitting || creatingEdition || Boolean(savedLogHref)"
              @click="toggleEditionPicker"
            >
              {{ showEditionPicker ? '− Fechar lista de edições' : 'Li outra edição' }}
            </button>
            <span
              v-if="!showEditionPicker"
              id="log-edition-summary"
              class="edition-summary"
              data-testid="log-edition-summary"
            >{{ editionSummary }}</span>
          </div>
          <span id="log-edition-hint" class="field-hint">Escolha a edição se quiser registrar editora e número de páginas certos.</span>

          <div v-if="showEditionPicker" id="edition-picker-panel" class="edition-picker-panel">
            <p v-if="loadingEditions" class="field-hint">Carregando edições…</p>
            <EditionPicker
              v-else-if="editionsList.length > 0"
              v-model="editionId"
              :editions="editionsList"
              :disabled="submitting || creatingEdition || Boolean(savedLogHref)"
            />
            <p v-else class="field-hint">
              Nenhuma outra edição cadastrada para esta obra.
            </p>

            <button
              type="button"
              class="new-edition-toggle"
              :aria-expanded="showNewEditionForm"
              aria-controls="new-edition-form"
              :disabled="submitting || creatingEdition || Boolean(savedLogHref)"
              @click="showNewEditionForm = !showNewEditionForm"
            >
              {{ showNewEditionForm ? '− Fechar cadastro de edição' : 'Cadastrar nova edição' }}
            </button>

            <div v-if="showNewEditionForm" id="new-edition-form" class="new-edition-form">
              <div class="form-row">
                <div class="form-group flex-1">
                  <label for="log-new-edition-isbn" class="form-label">ISBN</label>
                  <input
                    id="log-new-edition-isbn"
                    v-model="newEditionIsbn"
                    type="text"
                    class="form-input"
                    maxlength="40"
                    :disabled="submitting || creatingEdition || Boolean(savedLogHref)"
                    :aria-invalid="Boolean(newEditionErrors.isbn)"
                    :aria-describedby="newEditionErrors.isbn ? 'log-new-edition-isbn-error' : undefined"
                  >
                  <span v-if="newEditionErrors.isbn" id="log-new-edition-isbn-error" class="field-error" role="alert">
                    {{ newEditionErrors.isbn }}
                  </span>
                </div>

                <div class="form-group flex-1">
                  <label for="log-new-edition-publisher" class="form-label">Editora</label>
                  <input
                    id="log-new-edition-publisher"
                    v-model="newEditionPublisher"
                    type="text"
                    class="form-input"
                    maxlength="200"
                    :disabled="submitting || creatingEdition || Boolean(savedLogHref)"
                    :aria-invalid="Boolean(newEditionErrors.publisher)"
                    :aria-describedby="newEditionErrors.publisher ? 'log-new-edition-publisher-error' : undefined"
                  >
                  <span v-if="newEditionErrors.publisher" id="log-new-edition-publisher-error" class="field-error" role="alert">{{ newEditionErrors.publisher }}</span>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group flex-1">
                  <label for="log-new-edition-pages" class="form-label">Páginas</label>
                  <input
                    id="log-new-edition-pages"
                    v-model.number="newEditionPageCount"
                    type="number"
                    min="1"
                    class="form-input"
                    :disabled="submitting || creatingEdition || Boolean(savedLogHref)"
                    :aria-invalid="Boolean(newEditionErrors.page_count)"
                    :aria-describedby="newEditionErrors.page_count ? 'log-new-edition-pages-error' : undefined"
                  >
                  <span v-if="newEditionErrors.page_count" id="log-new-edition-pages-error" class="field-error" role="alert">{{ newEditionErrors.page_count }}</span>
                </div>

                <div class="form-group flex-1">
                  <label for="log-new-edition-year" class="form-label">Ano da edição</label>
                  <input
                    id="log-new-edition-year"
                    v-model.number="newEditionPublishedYear"
                    type="number"
                    class="form-input"
                    :disabled="submitting || creatingEdition || Boolean(savedLogHref)"
                    :aria-invalid="Boolean(newEditionErrors.published_year)"
                    :aria-describedby="newEditionErrors.published_year ? 'log-new-edition-year-error' : undefined"
                  >
                  <span v-if="newEditionErrors.published_year" id="log-new-edition-year-error" class="field-error" role="alert">{{ newEditionErrors.published_year }}</span>
                </div>

                <div class="form-group flex-1">
                  <label for="log-new-edition-language" class="form-label">Idioma</label>
                  <select
                    id="log-new-edition-language"
                    v-model="newEditionLanguage"
                    class="form-input form-select"
                    :disabled="submitting || creatingEdition || Boolean(savedLogHref)"
                  >
                    <option value="">Selecione o idioma...</option>
                    <option v-for="language in LANGUAGES" :key="language.code" :value="language.code">
                      {{ language.label }}
                    </option>
                  </select>
                </div>
              </div>

              <div class="form-group">
                <label for="log-new-edition-cover" class="form-label">URL da capa</label>
                <input
                  id="log-new-edition-cover"
                  v-model="newEditionCoverUrl"
                  type="url"
                  class="form-input"
                  maxlength="2000"
                  placeholder="https://exemplo.com/capa.jpg"
                  :disabled="submitting || creatingEdition || Boolean(savedLogHref)"
                  :aria-invalid="Boolean(newEditionErrors.cover_url)"
                  :aria-describedby="newEditionErrors.cover_url ? 'log-new-edition-cover-error' : 'log-new-edition-cover-hint'"
                >
                <span id="log-new-edition-cover-hint" class="field-hint">A URL precisa começar com https://.</span>
                <span v-if="newEditionErrors.cover_url" id="log-new-edition-cover-error" class="field-error" role="alert">
                  {{ newEditionErrors.cover_url }}
                </span>
              </div>

              <p v-if="newEditionErrors.form" class="field-error" role="alert">{{ newEditionErrors.form }}</p>
              <button
                type="button"
                class="edition-create-btn"
                :disabled="submitting || creatingEdition || Boolean(savedLogHref)"
                @click="handleCreateEdition"
              >
                {{ creatingEdition ? 'Cadastrando...' : 'Salvar nova edição' }}
              </button>
            </div>
          </div>
        </div>

        <fieldset class="form-group visibility-fieldset">
          <legend class="form-label">Visibilidade</legend>
          <div class="visibility-options">
            <label class="radio-card" :class="{ selected: visibility === 'publico' }">
              <input
                v-model="visibility"
                type="radio"
                name="log-visibility"
                value="publico"
                :disabled="submitting || Boolean(savedLogHref)"
                class="radio-input"
              >
              <div class="radio-text">
                <span class="radio-title">Público</span>
                <span class="radio-desc">Aparece no seu perfil e no feed dos membros. Só é visto por quem não tem conta se o seu perfil for público.</span>
              </div>
            </label>

            <label class="radio-card" :class="{ selected: visibility === 'privado' }">
              <input
                v-model="visibility"
                type="radio"
                name="log-visibility"
                value="privado"
                :disabled="submitting || Boolean(savedLogHref)"
                class="radio-input"
              >
              <div class="radio-text">
                <span class="radio-title">Privado</span>
                <span class="radio-desc">Só você vê. Não aparece no seu perfil nem no feed.</span>
              </div>
            </label>
          </div>
        </fieldset>

        <div
          v-if="invalidFields.length > 0"
          id="log-form-summary"
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

        <p v-if="errorMessage" id="log-form-error" class="error-message" role="alert">
          {{ errorMessage }}
        </p>
        <NuxtLink v-if="savedLogHref" :to="savedLogHref" class="saved-entry-link">
          Abrir leitura salva
        </NuxtLink>

        <div class="form-actions">
          <button
            type="submit"
            class="btn btn-primary submit-btn"
            :disabled="submitting || creatingEdition || Boolean(savedLogHref)"
          >
            <span v-if="submitting" class="spinner" aria-hidden="true" />
            <span>{{ submitButtonLabel }}</span>
          </button>

          <NuxtLink
            v-if="mode === 'edit' && initialLog"
            :to="`/entrada/${initialLog.id}`"
            class="btn btn-secondary cancel-link"
          >
            Cancelar
          </NuxtLink>
        </div>

        <div v-if="mode === 'edit'" class="remove-row">
          <button
            type="button"
            class="btn btn-danger delete-btn"
            :disabled="submitting || Boolean(savedLogHref)"
            @click="handleDelete"
          >
            Remover esta leitura
          </button>
        </div>
      </form>
    </div>

    <dialog
      v-if="mode === 'edit'"
      ref="leaveDialogRef"
      class="leave-dialog"
      aria-labelledby="leave-dialog-title"
      aria-describedby="leave-dialog-desc"
      @close="onLeaveDialogClose"
    >
      <h2 id="leave-dialog-title" class="leave-dialog-title">Sair sem salvar?</h2>
      <p id="leave-dialog-desc" class="leave-dialog-desc">As alterações nesta leitura serão perdidas.</p>
      <div class="leave-dialog-actions">
        <button
          ref="stayBtnRef"
          type="button"
          class="btn btn-primary leave-stay-btn"
          @click="stayOnPage"
        >
          Continuar editando
        </button>
        <button type="button" class="btn btn-danger leave-go-btn" @click="leaveWithoutSaving">
          Sair sem salvar
        </button>
      </div>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { isTimeoutOrAbort, TIMEOUT_MESSAGE } from '~/utils/fetch-error'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import type { AuthSessionState } from '~/middleware/auth'
import { createFormDraftKey, useFormDraft } from '~/composables/useFormDraft'
import BookCover from '../book/BookCover.vue'
import RatingInput from '../book/RatingInput.vue'
import SearchBox from '../search/SearchBox.vue'
import EditionPicker from './EditionPicker.vue'
import { LANGUAGES } from '~~/shared/constants/languages'
import type { LogEditionView as LogEdition, LogWithDetails } from '~~/shared/schemas/log'
import type { SearchResult } from '~~/shared/schemas/search'
import { logInputSchema } from '~~/shared/schemas/log'
import { coverUrlSchema, editionInputSchema, type EditionInput } from '~~/shared/schemas/work'

const props = withDefaults(
  defineProps<{
    mode?: 'create' | 'edit'
    initialLog?: LogWithDetails | null
    initialWork?: SearchResult | null
    disableChangeBook?: boolean
    finishing?: boolean
  }>(),
  {
    mode: 'create',
    initialLog: null,
    initialWork: null,
    disableChangeBook: false,
    finishing: false,
  },
)

const authSession = useState<AuthSessionState | null>('auth:session', () => null)

function getBrowserLocalDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

interface SelectedWorkState {
  id: string
  title: string
  slug: string
  authors: Array<{ name: string; slug?: string }>
  first_published_year?: number | null
  cover_url?: string | null
  ol_cover_id?: number | null
  isbn13?: string | null
}

const selectedWork = ref<SelectedWorkState | null>(null)
const editionId = ref<string | null>(null)
const isCurrentlyReading = ref(false)
const rating = ref<number | null>(null)
const review = ref('')
const defaultFinishedOn = ref('')
const finishedOn = ref('')
const startedOn = ref('')
const finishedPrecision = ref<'dia' | 'mes' | 'ano'>('dia')
const format = ref<'fisico' | 'ebook' | 'audio' | null>(null)
const visibility = ref<'publico' | 'privado'>('publico')

const showStartDate = ref(false)
const showEditionPicker = ref(false)
const editionsList = ref<LogEdition[]>([])
const loadingEditions = ref(false)
const showNewEditionForm = ref(false)
const creatingEdition = ref(false)
const newEditionIsbn = ref('')
const newEditionPublisher = ref('')
const newEditionPageCount = ref<number | null>(null)
const newEditionPublishedYear = ref<number | null>(null)
const newEditionLanguage = ref('')
const newEditionCoverUrl = ref('')
const newEditionErrors = ref<Record<string, string>>({})

interface LogFormDraft {
  work: SelectedWorkState | null
  editionId: string | null
  isCurrentlyReading: boolean
  rating: number | null
  review: string
  finishedOn: string
  startedOn: string
  finishedPrecision: 'dia' | 'mes' | 'ano'
  format: 'fisico' | 'ebook' | 'audio' | null
  visibility: 'publico' | 'privado'
  showStartDate: boolean
  showEditionPicker: boolean
  showNewEditionForm: boolean
  newEditionIsbn: string
  newEditionPublisher: string
  newEditionPageCount: number | null
  newEditionPublishedYear: number | null
  newEditionLanguage: string
  newEditionCoverUrl: string
}

function currentDraftKey(): string | null {
  const context = props.mode === 'edit'
    ? props.initialLog?.id ?? 'edit'
    : props.initialWork?.id ?? 'catalog'
  return createFormDraftKey('log', authSession.value?.user?.id, props.mode, context)
}

const initialDraftKey = currentDraftKey()
const formDraft = useFormDraft<LogFormDraft>({
  key: initialDraftKey,
  snapshot: () => ({
    work: selectedWork.value,
    editionId: editionId.value,
    isCurrentlyReading: isCurrentlyReading.value,
    rating: rating.value,
    review: review.value,
    finishedOn: finishedOn.value,
    startedOn: startedOn.value,
    finishedPrecision: finishedPrecision.value,
    format: format.value,
    visibility: visibility.value,
    showStartDate: showStartDate.value,
    showEditionPicker: showEditionPicker.value,
    showNewEditionForm: showNewEditionForm.value,
    newEditionIsbn: newEditionIsbn.value,
    newEditionPublisher: newEditionPublisher.value,
    newEditionPageCount: newEditionPageCount.value,
    newEditionPublishedYear: newEditionPublishedYear.value,
    newEditionLanguage: newEditionLanguage.value,
    newEditionCoverUrl: newEditionCoverUrl.value,
  }),
})

const submitting = ref(false)
const errorMessage = ref('')
const savedLogHref = ref<string | null>(null)

type FieldKey = 'finished_on' | 'started_on' | 'review'
const FIELD_ORDER: FieldKey[] = ['finished_on', 'started_on', 'review']
const FIELD_LABELS: Record<FieldKey, string> = {
  finished_on: 'Data de término',
  started_on: 'Data de início',
  review: 'Resenha',
}
const FIELD_INPUT_IDS: Record<FieldKey, string> = {
  finished_on: 'log-finished-on',
  started_on: 'log-started-on',
  review: 'log-review',
}
const fieldErrors = ref<Partial<Record<FieldKey, string>>>({})
const invalidFields = computed(() => FIELD_ORDER.filter((key) => fieldErrors.value[key]))

function describedBy(key: FieldKey, extra?: string): string | undefined {
  const ids = [fieldErrors.value[key] ? `${FIELD_INPUT_IDS[key]}-error` : null, extra ?? null]
  const joined = ids.filter(Boolean).join(' ')
  return joined || undefined
}

function clearFieldError(key: FieldKey): void {
  if (!fieldErrors.value[key]) return
  fieldErrors.value = Object.fromEntries(
    Object.entries(fieldErrors.value).filter(([k]) => k !== key),
  )
}

watch(finishedOn, () => clearFieldError('finished_on'))
watch(startedOn, () => {
  clearFieldError('started_on')
})
watch(review, () => clearFieldError('review'))

async function focusField(key: FieldKey): Promise<void> {
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

function toFieldKey(path: unknown): FieldKey | null {
  const head = String(path ?? '')
  return (FIELD_ORDER as string[]).includes(head) ? (head as FieldKey) : null
}

function friendlyFieldMessage(key: FieldKey, message: string): string {
  if (key === 'review') return message
  const noun = key === 'finished_on' ? 'de término' : 'de início'
  if (message.includes('futuro')) {
    return `A data ${noun} não pode ser no futuro. Escolha hoje ou um dia anterior.`
  }
  if (message.includes('formato')) {
    return `Informe a data ${noun} completa, com dia, mês e ano.`
  }
  if (message.includes('anterior ou igual')) {
    return 'A data de início não pode ser depois da data de término. Ajuste uma das duas.'
  }
  return message
}

function validateLocally(payload: Record<string, unknown>): boolean {
  const errors: Partial<Record<FieldKey, string>> = {}
  if (!isCurrentlyReading.value && !finishedOn.value) {
    errors.finished_on = 'Informe a data de término ou marque "Estou lendo este livro atualmente".'
  }
  if (review.value.length > 10000) {
    const extra = review.value.length - 10000
    errors.review = `A resenha tem ${review.value.length.toLocaleString('pt-BR')} caracteres e o limite é 10.000. Apague ${extra.toLocaleString('pt-BR')} para poder salvar.`
  }
  const parsed = logInputSchema.safeParse(payload)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = toFieldKey(issue.path[0])
      if (key && !errors[key]) errors[key] = friendlyFieldMessage(key, issue.message)
    }
  }
  fieldErrors.value = errors
  if (errors.started_on) showStartDate.value = true
  return Object.keys(errors).length === 0
}

function applyServerError(message: string | undefined): boolean {
  const match = message?.match(/^Campo inválido: ([\w.]+)\.\s*(.*)$/)
  const key = match ? toFieldKey(match[1]?.split('.')[0]) : null
  if (!key || !match) return false
  fieldErrors.value = { [key]: friendlyFieldMessage(key, match[2] || 'Valor inválido.') }
  if (key === 'started_on') showStartDate.value = true
  return true
}

const showFinishedHint = computed(
  () => Boolean(defaultFinishedOn.value)
    && props.mode === 'create'
    && finishedOn.value === defaultFinishedOn.value,
)

const submitButtonLabel = computed(() => {
  if (submitting.value) return 'Salvando...'
  if (finishingMode) return 'Concluir leitura'
  return props.mode === 'edit' ? 'Salvar alterações' : 'Registrar leitura'
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
  }
  editionId.value = null
  editionsList.value = []
  showEditionPicker.value = false
}

function changeBook(): void {
  selectedWork.value = null
  editionId.value = null
  editionsList.value = []
  showEditionPicker.value = false
}

const editionSummary = computed(() => {
  const id = editionId.value
  if (!id) return 'Edição padrão'
  const ed = editionsList.value.find((e) => e.id === id)
    ?? (props.initialLog?.edition?.id === id ? props.initialLog.edition : null)
  if (!ed) return 'Edição escolhida'
  const parts = [
    ed.publisher || 'Editora não informada',
    ed.page_count ? `${ed.page_count} págs.` : null,
    ed.isbn13 ? `ISBN ${ed.isbn13}` : null,
  ].filter((p): p is string => Boolean(p))
  return parts.join(' · ')
})

async function toggleEditionPicker(): Promise<void> {
  showEditionPicker.value = !showEditionPicker.value
  if (showEditionPicker.value && selectedWork.value && editionsList.value.length === 0) {
    await loadEditions()
  }
}

async function loadEditions(): Promise<void> {
  if (!selectedWork.value) return
  loadingEditions.value = true
  try {
    const res = await $fetch<{ editions: LogEdition[] }>(
      `/api/works/${selectedWork.value.id}/editions`,
      {
        timeout: 15_000,
        retry: 0,
      },
    )
    editionsList.value = res.editions
  } catch {
  } finally {
    loadingEditions.value = false
  }
}

function validateNewEdition(): boolean {
  const payload: EditionInput = {
    isbn: newEditionIsbn.value.trim() || null,
    publisher: newEditionPublisher.value.trim() || null,
    page_count: newEditionPageCount.value === null ? null : Number(newEditionPageCount.value),
    published_year: newEditionPublishedYear.value === null ? null : Number(newEditionPublishedYear.value),
    language: newEditionLanguage.value || null,
    cover_url: newEditionCoverUrl.value.trim() || null,
    ol_cover_id: null,
  }
  const parsed = editionInputSchema.safeParse(payload)
  const errors: Record<string, string> = {}
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? 'form')
      if (!errors[field]) errors[field] = issue.message
    }
  }
  if (newEditionCoverUrl.value.trim()) {
    const coverResult = coverUrlSchema.safeParse(newEditionCoverUrl.value.trim())
    if (!coverResult.success) {
      errors.cover_url = coverResult.error.issues[0]?.message ?? 'A URL da capa precisa começar com https://'
    }
  }
  newEditionErrors.value = errors
  return Object.keys(errors).length === 0
}

function clearNewEditionForm(): void {
  newEditionIsbn.value = ''
  newEditionPublisher.value = ''
  newEditionPageCount.value = null
  newEditionPublishedYear.value = null
  newEditionLanguage.value = ''
  newEditionCoverUrl.value = ''
  newEditionErrors.value = {}
}

async function handleCreateEdition(): Promise<void> {
  if (submitting.value || creatingEdition.value) return
  if (!selectedWork.value || !validateNewEdition()) return
  creatingEdition.value = true

  const payload: EditionInput = {
    isbn: newEditionIsbn.value.trim() || null,
    publisher: newEditionPublisher.value.trim() || null,
    page_count: newEditionPageCount.value === null ? null : Number(newEditionPageCount.value),
    published_year: newEditionPublishedYear.value === null ? null : Number(newEditionPublishedYear.value),
    language: newEditionLanguage.value || null,
    cover_url: newEditionCoverUrl.value.trim() || null,
    ol_cover_id: null,
  }

  try {
    const result = await $fetch<{ id: string }>(`/api/works/${selectedWork.value.id}/editions`, {
      method: 'POST',
      timeout: 15_000,
      retry: 0,
      body: payload,
    })
    await loadEditions()
    editionId.value = result.id
    clearNewEditionForm()
    showNewEditionForm.value = false
  } catch (err: unknown) {
    if (isTimeoutOrAbort(err)) {
      newEditionErrors.value = { form: TIMEOUT_MESSAGE }
      return
    }
    const fetchErr = err as { data?: { message?: string } }
    newEditionErrors.value = {
      form: fetchErr.data?.message ?? 'Não foi possível cadastrar a edição.',
    }
  } finally {
    creatingEdition.value = false
  }
}

let draftReady = false
let draftPersistenceEnabled = initialDraftKey !== null
const draftRestored = ref(false)

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

function recordOf(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function parseSelectedWork(value: unknown): SelectedWorkState | null {
  const work = recordOf(value)
  if (!work || typeof work.id !== 'string' || typeof work.title !== 'string' || typeof work.slug !== 'string') {
    return null
  }
  if (!Array.isArray(work.authors)) return null
  const authors: SelectedWorkState['authors'] = []
  for (const valueAuthor of work.authors) {
    const author = recordOf(valueAuthor)
    if (!author || typeof author.name !== 'string') return null
    authors.push({
      name: author.name,
      ...(typeof author.slug === 'string' ? { slug: author.slug } : {}),
    })
  }
  return {
    id: work.id,
    title: work.title,
    slug: work.slug,
    authors,
    first_published_year: typeof work.first_published_year === 'number' ? work.first_published_year : null,
    cover_url: typeof work.cover_url === 'string' ? work.cover_url : null,
    ol_cover_id: typeof work.ol_cover_id === 'number' ? work.ol_cover_id : null,
    isbn13: typeof work.isbn13 === 'string' ? work.isbn13 : null,
  }
}

function parseLogDraft(value: unknown): LogFormDraft | null {
  const draft = recordOf(value)
  if (!draft) return null
  const precision = draft.finishedPrecision
  const formatValue = draft.format
  const visibilityValue = draft.visibility
  return {
    work: parseSelectedWork(draft.work),
    editionId: typeof draft.editionId === 'string' ? draft.editionId : null,
    isCurrentlyReading: draft.isCurrentlyReading === true,
    rating: typeof draft.rating === 'number' && Number.isFinite(draft.rating) ? draft.rating : null,
    review: typeof draft.review === 'string' ? draft.review : '',
    finishedOn: typeof draft.finishedOn === 'string' ? draft.finishedOn : defaultFinishedOn.value,
    startedOn: typeof draft.startedOn === 'string' ? draft.startedOn : '',
    finishedPrecision: precision === 'mes' || precision === 'ano' ? precision : 'dia',
    format: formatValue === 'fisico' || formatValue === 'ebook' || formatValue === 'audio' ? formatValue : null,
    visibility: visibilityValue === 'privado' ? 'privado' : 'publico',
    showStartDate: draft.showStartDate === true,
    showEditionPicker: draft.showEditionPicker === true,
    showNewEditionForm: draft.showNewEditionForm === true,
    newEditionIsbn: typeof draft.newEditionIsbn === 'string' ? draft.newEditionIsbn : '',
    newEditionPublisher: typeof draft.newEditionPublisher === 'string' ? draft.newEditionPublisher : '',
    newEditionPageCount: typeof draft.newEditionPageCount === 'number' ? draft.newEditionPageCount : null,
    newEditionPublishedYear: typeof draft.newEditionPublishedYear === 'number' ? draft.newEditionPublishedYear : null,
    newEditionLanguage: typeof draft.newEditionLanguage === 'string' ? draft.newEditionLanguage : '',
    newEditionCoverUrl: typeof draft.newEditionCoverUrl === 'string' ? draft.newEditionCoverUrl : '',
  }
}

function draftHasContent(draft: LogFormDraft): boolean {
  return Boolean(
    draft.work
    || draft.isCurrentlyReading
    || draft.editionId
    || draft.rating !== null
    || draft.review.trim()
    || draft.startedOn
    || draft.newEditionIsbn
    || draft.newEditionPublisher
    || draft.newEditionPageCount !== null
    || draft.newEditionPublishedYear !== null
    || draft.newEditionLanguage
    || draft.newEditionCoverUrl,
  )
}

function restoreDraft(): boolean {
  if (props.mode !== 'create') return false
  const draft = formDraft.restore(parseLogDraft)
  const chosenId = props.initialWork?.id
  const matchesContext = Boolean(draft && (!chosenId || draft.work?.id === chosenId))
  if (draft && matchesContext) {
    selectedWork.value = draft.work
    editionId.value = draft.editionId
    isCurrentlyReading.value = draft.isCurrentlyReading
    rating.value = draft.rating
    review.value = draft.review
    finishedOn.value = draft.finishedOn
    startedOn.value = draft.startedOn
    finishedPrecision.value = draft.finishedPrecision
    format.value = draft.format
    visibility.value = draft.visibility
    showStartDate.value = draft.showStartDate || Boolean(draft.startedOn)
    showEditionPicker.value = draft.showEditionPicker
    showNewEditionForm.value = draft.showNewEditionForm
    newEditionIsbn.value = draft.newEditionIsbn
    newEditionPublisher.value = draft.newEditionPublisher
    newEditionPageCount.value = draft.newEditionPageCount
    newEditionPublishedYear.value = draft.newEditionPublishedYear
    newEditionLanguage.value = draft.newEditionLanguage
    newEditionCoverUrl.value = draft.newEditionCoverUrl
    draftRestored.value = draftHasContent(draft)
  }
  return matchesContext
}

async function discardDraft(): Promise<void> {
  draftReady = false
  const work = props.initialWork
  selectedWork.value = work && work.id && work.slug
    ? {
        id: work.id,
        title: work.title,
        slug: work.slug,
        authors: work.authors,
        first_published_year: work.first_published_year,
        cover_url: work.cover_url,
      }
    : null
  editionId.value = null
  editionsList.value = []
  showEditionPicker.value = false
  rating.value = null
  review.value = ''
  finishedOn.value = defaultFinishedOn.value
  startedOn.value = ''
  showStartDate.value = false
  finishedPrecision.value = 'dia'
  format.value = null
  visibility.value = 'publico'
  showNewEditionForm.value = false
  newEditionIsbn.value = ''
  newEditionPublisher.value = ''
  newEditionPageCount.value = null
  newEditionPublishedYear.value = null
  newEditionLanguage.value = ''
  newEditionCoverUrl.value = ''
  newEditionErrors.value = {}
  draftRestored.value = false
  clearDraft()
  await nextTick()
  draftReady = true
}

function clearDraft(): void {
  draftReady = false
  draftRestored.value = false
  if (draftPersistenceEnabled) formDraft.clear()
  else formDraft.cancel()
}

watch(
  [
    selectedWork,
    editionId,
    isCurrentlyReading,
    rating,
    review,
    finishedOn,
    startedOn,
    finishedPrecision,
    format,
    visibility,
    showStartDate,
    showEditionPicker,
    showNewEditionForm,
    newEditionIsbn,
    newEditionPublisher,
    newEditionPageCount,
    newEditionPublishedYear,
    newEditionLanguage,
    newEditionCoverUrl,
  ],
  () => {
    if (props.mode === 'create' && draftReady && draftPersistenceEnabled) formDraft.schedule()
  },
  { deep: true },
)

watch(
  () => props.initialWork,
  (work) => {
    if (work && work.id && work.slug) {
      selectedWork.value = {
        id: work.id,
        title: work.title,
        slug: work.slug,
        authors: work.authors,
        first_published_year: work.first_published_year,
        cover_url: work.cover_url,
      }
    }
  },
  { immediate: true },
)

const finishingMode = props.mode === 'edit'
  && props.finishing
  && Boolean(props.initialLog)
  && !props.initialLog?.finished_on

if (props.mode === 'edit' && props.initialLog) {
  const log = props.initialLog
  selectedWork.value = {
    id: log.work.id,
    title: log.work.title,
    slug: log.work.slug,
    authors: log.work.authors,
    first_published_year: log.work.first_published_year,
    cover_url: log.edition?.cover_url ?? log.work.cover_url,
    ol_cover_id: log.edition?.ol_cover_id ?? null,
    isbn13: log.edition?.isbn13 ?? null,
  }
  editionId.value = log.edition_id
  rating.value = log.rating
  review.value = log.review ?? ''
  finishedOn.value = log.finished_on ?? defaultFinishedOn.value
  startedOn.value = log.started_on ?? ''
  showStartDate.value = Boolean(log.started_on)
  finishedPrecision.value = log.finished_precision
  format.value = log.format
  visibility.value = log.visibility
  isCurrentlyReading.value = finishingMode ? false : !log.finished_on
}

function editSnapshot(): string {
  return JSON.stringify({
    editionId: editionId.value,
    isCurrentlyReading: isCurrentlyReading.value,
    rating: rating.value,
    review: review.value,
    finishedOn: isCurrentlyReading.value ? null : finishedOn.value,
    startedOn: showStartDate.value || isCurrentlyReading.value ? startedOn.value : '',
    finishedPrecision: finishedPrecision.value,
    format: format.value,
    visibility: visibility.value,
  })
}

const editBaseline = ref<string | null>(null)
const isDirty = computed(() => (
  props.mode === 'edit'
  && editBaseline.value !== null
  && editSnapshot() !== editBaseline.value
))
let allowLeave = false
const leaveDialogRef = ref<HTMLDialogElement | null>(null)
const stayBtnRef = ref<HTMLButtonElement | null>(null)
let pendingLeaveTo: string | null = null

onBeforeRouteLeave((to) => {
  if (allowLeave || !isDirty.value) return true
  pendingLeaveTo = to.fullPath
  const dialog = leaveDialogRef.value
  if (dialog && !dialog.open && typeof dialog.showModal === 'function') {
    dialog.showModal()
    void nextTick(() => stayBtnRef.value?.focus())
  }
  return false
})

function stayOnPage(): void {
  pendingLeaveTo = null
  leaveDialogRef.value?.close()
}

function onLeaveDialogClose(): void {
  if (!allowLeave) pendingLeaveTo = null
}

async function leaveWithoutSaving(): Promise<void> {
  const dest = pendingLeaveTo
  allowLeave = true
  leaveDialogRef.value?.close()
  pendingLeaveTo = null
  if (!dest) return
  try {
    const navigation = await navigateTo(dest)
    if (navigation) {
      allowLeave = false
      errorMessage.value = 'Não foi possível sair da página. Tente novamente.'
    }
  } catch {
    allowLeave = false
    errorMessage.value = 'Não foi possível sair da página. Tente novamente.'
  }
}

function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (allowLeave || !isDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('beforeunload', onBeforeUnload)
})

onMounted(() => {
  defaultFinishedOn.value = getBrowserLocalDate()
  if (props.mode === 'edit' && props.initialLog) {
    if (!props.initialLog.finished_on) finishedOn.value = defaultFinishedOn.value
    if (finishingMode) {
      finishedOn.value = defaultFinishedOn.value
      void nextTick(() => {
        document.querySelector<HTMLInputElement>('#log-rating-group input[type="range"]')?.focus()
      })
    }
    editBaseline.value = editSnapshot()
    window.addEventListener('beforeunload', onBeforeUnload)
  } else {
    const restoredDraft = restoreDraft()
    if (!restoredDraft) finishedOn.value = defaultFinishedOn.value
    void nextTick(() => {
      draftReady = draftPersistenceEnabled
    })
  }
})

async function handleSubmit(): Promise<void> {
  if (submitting.value || creatingEdition.value || savedLogHref.value) return
  if (!selectedWork.value) {
    errorMessage.value = 'Selecione uma obra para registrar.'
    return
  }

  errorMessage.value = ''

  const payload = {
    work_id: selectedWork.value.id,
    edition_id: editionId.value,
    rating: isCurrentlyReading.value ? null : rating.value,
    review: review.value.length > 0 ? review.value : null,
    started_on: isCurrentlyReading.value
      ? (startedOn.value || getBrowserLocalDate())
      : (showStartDate.value && startedOn.value ? startedOn.value : null),
    finished_on: isCurrentlyReading.value ? null : (finishedOn.value || null),
    finished_precision: finishedPrecision.value,
    format: format.value,
    visibility: visibility.value,
  }

  if (!validateLocally(payload)) {
    await focusFirstInvalid()
    return
  }
  submitting.value = true

  try {
    if (props.mode === 'edit' && props.initialLog) {
      await $fetch(`/api/logs/${props.initialLog.id}`, {
        method: 'PATCH',
        timeout: 15_000,
        retry: 0,
        body: payload,
      })
      allowLeave = true
      savedLogHref.value = `/entrada/${props.initialLog.id}`
      try {
        const navigation = await navigateTo(savedLogHref.value)
        if (navigation) {
          errorMessage.value = 'A leitura foi salva, mas não foi possível abrir o registro. Use o link abaixo.'
        }
      } catch {
        errorMessage.value = 'A leitura foi salva, mas não foi possível abrir o registro. Use o link abaixo.'
      }
    } else {
      const res = await $fetch<{ id: string }>('/api/logs', {
        method: 'POST',
        timeout: 15_000,
        retry: 0,
        body: payload,
      })
      clearDraft()
      savedLogHref.value = `/entrada/${res.id}`
      try {
        const navigation = await navigateTo(savedLogHref.value)
        if (navigation) {
          errorMessage.value = 'A leitura foi salva, mas não foi possível abrir o registro. Use o link abaixo.'
        }
      } catch {
        errorMessage.value = 'A leitura foi salva, mas não foi possível abrir o registro. Use o link abaixo.'
      }
    }
  } catch (err: unknown) {
    if (isTimeoutOrAbort(err)) {
      errorMessage.value = TIMEOUT_MESSAGE
      return
    }
    const fetchErr = err as { data?: { message?: string } }
    if (applyServerError(fetchErr.data?.message)) {
      submitting.value = false
      await focusFirstInvalid()
      return
    }
    errorMessage.value = fetchErr.data?.message ?? 'Não foi possível salvar o registro de leitura.'
  } finally {
    submitting.value = false
  }
}

const removeRequest = useState<string | null>('entry:remove-request', () => null)

function handleDelete(): void {
  if (!props.initialLog) return
  removeRequest.value = props.initialLog.id
  allowLeave = true
  void navigateTo(`/entrada/${props.initialLog.id}`)
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

.draft-notice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  margin: 0 0 var(--space-4);
  font-size: var(--font-size-sm);
  color: var(--text-color);
}

.finish-notice {
  margin: 0 0 var(--space-4);
  font-size: var(--font-size-sm);
  color: var(--text-bright);
}

.draft-discard-btn {
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

.draft-discard-btn:focus-visible {
  outline: 2px solid var(--highlight);
  outline-offset: 2px;
}

@media (pointer: coarse) {
  .draft-discard-btn {
    min-height: var(--target-min-size);
  }
}

.log-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
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

.char-count {
  font-size: var(--font-size-xs);
  color: var(--text-color);
}

.char-count-limit {
  color: var(--danger-text);
  font-weight: bold;
}

.field-hint {
  font-size: var(--font-size-xs);
  color: var(--text-color);
  margin: 0;
}

.form-select {
  cursor: pointer;
}

.form-textarea {
  min-height: 120px;
}

.edition-toggle-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-1) var(--space-2);
}

.edition-summary {
  font-size: var(--font-size-sm);
  color: var(--text-color);
  overflow-wrap: anywhere;
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
  background-color: var(--highlight-soft);
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

.new-edition-toggle {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: var(--space-2) 0;
  color: var(--highlight);
  background: transparent;
  border: none;
  font: inherit;
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.new-edition-toggle:hover {
  text-decoration: underline;
}

.new-edition-toggle:focus-visible,
.edition-create-btn:focus-visible {
  outline: 2px solid var(--highlight);
  outline-offset: 2px;
}

.new-edition-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--input-bg);
}

.field-error {
  margin: 0;
  color: var(--danger-text);
  font-size: var(--font-size-sm);
}

.edition-create-btn {
  align-self: flex-start;
  min-height: 44px;
  padding: var(--space-2) var(--space-4);
  color: #14181c;
  background: var(--highlight);
  border: 0;
  border-radius: var(--radius-sm);
  font: inherit;
  font-size: var(--font-size-sm);
  font-weight: 600;
  cursor: pointer;
}

.edition-create-btn:disabled,
.new-edition-toggle:disabled {
  cursor: not-allowed;
  opacity: 0.6;
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
  background-color: var(--highlight-soft);
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

.error-summary {
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--danger);
  border-radius: var(--radius-sm);
  color: var(--text-bright);
  font-size: var(--font-size-sm);
}

.error-summary:focus-visible {
  outline: 2px solid var(--highlight);
  outline-offset: 2px;
}

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

.error-summary-link:focus-visible {
  outline: 2px solid var(--highlight);
  outline-offset: 2px;
}

.error-message {
  color: var(--danger-text);
  font-size: var(--font-size-sm);
  margin: 0;
}

.form-actions {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  margin-top: var(--space-4);
}

.submit-btn {
  flex: 1;
}

.leave-dialog {
  background-color: var(--bg-color);
  color: var(--text-color);
  border: 1px solid var(--input-bg);
  border-radius: var(--radius-md);
  padding: var(--space-6);
  width: min(420px, calc(100vw - 2 * var(--space-4)));
  box-sizing: border-box;
}

.leave-dialog::backdrop {
  background-color: rgba(0, 0, 0, 0.6);
}

.leave-dialog-title {
  margin: 0 0 var(--space-2);
  font-family: var(--font-serif);
  font-size: var(--font-size-xl);
  font-weight: 600;
  color: var(--text-bright);
}

.leave-dialog-desc {
  margin: 0 0 var(--space-6);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
}

.leave-dialog-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.remove-row {
  display: flex;
  justify-content: flex-start;
  margin-top: var(--space-4);
  padding-top: var(--space-3);
  border-top: 1px solid var(--input-bg);
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
