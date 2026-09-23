<template>
  <form class="edition-editor" novalidate @submit.prevent="handleSubmit">
    <div class="edition-head">
      <h3 class="edition-title">{{ headingText }}</h3>
      <BookCover
        v-if="previewCoverUrl"
        :cover-url="previewCoverUrl"
        :title="workTitle"
        :alt="`Prévia da capa de ${workTitle}`"
        class="edition-cover-preview"
      />
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label" :for="`${uid}-isbn`">ISBN</label>
        <input
          :id="`${uid}-isbn`"
          v-model="isbn"
          class="form-input"
          type="text"
          maxlength="40"
          inputmode="numeric"
        >
        <p class="form-hint">
          Qualquer grafia serve. O que não for um ISBN válido é gravado como “sem ISBN”, que é um
          estado legítimo e repetível.
        </p>
      </div>

      <div class="form-group">
        <label class="form-label" :for="`${uid}-publisher`">Editora</label>
        <input
          :id="`${uid}-publisher`"
          v-model="publisher"
          class="form-input"
          type="text"
          maxlength="200"
        >
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label" :for="`${uid}-pages`">Páginas</label>
        <input
          :id="`${uid}-pages`"
          v-model="pagesText"
          class="form-input"
          type="number"
          step="1"
          min="1"
          max="50000"
          :aria-invalid="Boolean(errors.page_count)"
        >
        <p v-if="errors.page_count" class="error-message">{{ errors.page_count }}</p>
      </div>

      <div class="form-group">
        <label class="form-label" :for="`${uid}-year`">Ano desta edição</label>
        <input
          :id="`${uid}-year`"
          v-model="yearText"
          class="form-input"
          type="number"
          step="1"
          min="-3000"
          max="2100"
          :aria-invalid="Boolean(errors.published_year)"
        >
        <p v-if="errors.published_year" class="error-message">{{ errors.published_year }}</p>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label" :for="`${uid}-language`">Idioma desta edição</label>
        <select :id="`${uid}-language`" v-model="language" class="form-select">
          <option value="">Não informado</option>
          <option v-for="lang in LANGUAGES" :key="lang.code" :value="lang.code">
            {{ lang.label }}
          </option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" :for="`${uid}-cover`">URL da capa</label>
        <input
          :id="`${uid}-cover`"
          v-model="coverUrl"
          class="form-input"
          type="url"
          maxlength="2000"
          placeholder="https://…"
          :aria-invalid="Boolean(errors.cover_url)"
        >
        <p v-if="errors.cover_url" class="error-message">{{ errors.cover_url }}</p>
      </div>
    </div>

    <p v-if="serverError" class="error-message server-error" role="alert">{{ serverError }}</p>

    <div class="edition-actions">
      <button type="submit" class="btn btn-primary" :disabled="busy">
        {{ busy ? 'Salvando…' : submitLabel }}
      </button>

      <button
        v-if="props.edition"
        type="button"
        class="btn btn-danger"
        :disabled="busy"
        @click="onDeleteClick"
      >
        {{ confirmingDelete ? 'Confirmar exclusão' : 'Excluir edição' }}
      </button>

      <button
        v-if="confirmingDelete || !props.edition"
        type="button"
        class="btn btn-secondary"
        :disabled="busy"
        @click="onSecondaryClick"
      >
        Cancelar
      </button>

      <span v-if="savedNote" class="saved-note" role="status">{{ savedNote }}</span>
    </div>

    <p v-if="confirmingDelete" class="delete-warning" role="alert">
      Os registros de leitura que apontam para esta edição não são apagados — apenas deixam de
      indicar qual edição foi lida.
    </p>
  </form>
</template>

<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import BookCover from '~/components/book/BookCover.vue'
import { LANGUAGES } from '~~/shared/constants/languages'
import { isHttpsCoverUrl, type WorkEditionView } from '~~/shared/schemas/work'
import { isTimeoutOrAbort, TIMEOUT_MESSAGE } from '~/utils/fetch-error'

const props = defineProps<{
  workId: string
  workTitle: string
  /** null puts the component in create mode. */
  edition: WorkEditionView | null
}>()

const emit = defineEmits<{
  (e: 'saved' | 'deleted' | 'cancel'): void
}>()

const uid = useId()

const isbn = ref(props.edition?.isbn13 ?? '')
const publisher = ref(props.edition?.publisher ?? '')
const pagesText = ref(props.edition?.page_count === null || props.edition?.page_count === undefined
  ? ''
  : String(props.edition.page_count))
const yearText = ref(props.edition?.published_year === null || props.edition?.published_year === undefined
  ? ''
  : String(props.edition.published_year))
const language = ref(props.edition?.language ?? '')
const coverUrl = ref(props.edition?.cover_url ?? '')

const busy = ref(false)
const confirmingDelete = ref(false)
const savedNote = ref('')
const serverError = ref('')
const errors = ref<Record<string, string>>({})

const headingText = computed(() =>
  props.edition
    ? props.edition.publisher || props.edition.isbn13 || 'Edição sem identificação'
    : 'Nova edição',
)

const submitLabel = computed(() => (props.edition ? 'Salvar edição' : 'Adicionar edição'))

const previewCoverUrl = computed(() =>
  isHttpsCoverUrl(coverUrl.value) ? coverUrl.value.trim() : null,
)

function textOrNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function intOrNull(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isInteger(parsed) ? parsed : Number.NaN
}

function validate(): boolean {
  // Rebuilt rather than mutated key by key: one assignment is one reactive
  // update, and there is no way to leave a stale message behind.
  const next: Record<string, string> = {}

  const pages = intOrNull(pagesText.value)
  if (Number.isNaN(pages)) {
    next.page_count = 'Informe um número inteiro de páginas.'
  } else if (pages !== null && pages <= 0) {
    next.page_count = 'O número de páginas deve ser maior que zero.'
  }

  const year = intOrNull(yearText.value)
  if (Number.isNaN(year)) {
    next.published_year = 'Informe um ano inteiro.'
  } else if (year !== null && (year < -3000 || year > 2100)) {
    next.published_year = 'O ano deve estar entre -3000 e 2100.'
  }

  const cover = textOrNull(coverUrl.value)
  if (cover !== null && !isHttpsCoverUrl(cover)) {
    next.cover_url = 'A URL da capa precisa começar com https://'
  }

  errors.value = next
  return Object.keys(next).length === 0
}

function buildBody() {
  return {
    isbn: textOrNull(isbn.value),
    publisher: textOrNull(publisher.value),
    page_count: intOrNull(pagesText.value),
    published_year: intOrNull(yearText.value),
    language: language.value === '' ? null : language.value,
    cover_url: textOrNull(coverUrl.value),
  }
}

function reportError(error: unknown, fallback: string): void {
  serverError.value = isTimeoutOrAbort(error)
    ? TIMEOUT_MESSAGE
    : (error as { data?: { message?: string } })?.data?.message ?? fallback
}

async function handleSubmit(): Promise<void> {
  serverError.value = ''
  savedNote.value = ''
  confirmingDelete.value = false
  if (!validate()) return

  busy.value = true
  try {
    if (props.edition) {
      await $fetch(`/api/editions/${props.edition.id}` as string, {
        method: 'PATCH',
        body: buildBody(),
        timeout: 15_000,
        retry: 0,
      })
      savedNote.value = 'Edição salva.'
    } else {
      await $fetch(`/api/works/${props.workId}/editions` as string, {
        method: 'POST',
        body: buildBody(),
        timeout: 15_000,
        retry: 0,
      })
    }
    emit('saved')
  } catch (error) {
    reportError(error, 'Não foi possível salvar a edição. Tente novamente.')
  } finally {
    busy.value = false
  }
}

/**
 * Two clicks, not `window.confirm`. The first arms the button and reveals what
 * happens to the reading logs that point here; the second deletes.
 */
function onDeleteClick(): void {
  serverError.value = ''
  if (!confirmingDelete.value) {
    confirmingDelete.value = true
    return
  }
  void handleDelete()
}

function onSecondaryClick(): void {
  if (confirmingDelete.value) {
    confirmingDelete.value = false
    return
  }
  emit('cancel')
}

async function handleDelete(): Promise<void> {
  if (!props.edition) return

  busy.value = true
  try {
    await $fetch(`/api/editions/${props.edition.id}` as string, {
      method: 'DELETE',
      timeout: 15_000,
      retry: 0,
    })
    confirmingDelete.value = false
    emit('deleted')
  } catch (error) {
    reportError(error, 'Não foi possível excluir a edição. Tente novamente.')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.edition-editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  border: 1px solid var(--input-bg);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  min-width: 0;
}

.edition-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.edition-title {
  font-family: var(--font-serif);
  font-size: var(--font-size-lg);
  color: #fff;
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}

.edition-cover-preview {
  width: 48px;
  flex: none;
}

.edition-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.saved-note {
  font-size: var(--font-size-sm);
  color: var(--highlight);
}

.server-error,
.delete-warning {
  margin: 0;
}

.delete-warning {
  font-size: var(--font-size-sm);
  color: var(--text-color);
}
</style>
