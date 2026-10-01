<template>
  <form class="work-edit-form" novalidate @submit.prevent="handleSubmit">
    <div class="form-group">
      <label class="form-label" for="work-title">Título</label>
      <input
        id="work-title"
        v-model="title"
        class="form-input"
        type="text"
        maxlength="300"
        required
        :aria-invalid="Boolean(errors.title)"
        :aria-describedby="errors.title ? 'work-title-error' : undefined"
      >
      <p v-if="errors.title" id="work-title-error" class="error-message">{{ errors.title }}</p>
    </div>

    <fieldset class="authors-fieldset">
      <legend class="form-label">Autores</legend>
      <p class="form-hint">
        O país do autor alimenta o mapa de leituras. Um país fora da lista - “Roma Antiga”, por
        exemplo - é aceito e aparece no perfil, mas não no mapa.
      </p>

      <div v-for="author in authorRows" :key="author.id" class="author-row">
        <div class="form-group author-name-group">
          <label class="form-hint" :for="`author-name-${author.id}`">Nome</label>
          <input
            :id="`author-name-${author.id}`"
            v-model="author.name"
            class="form-input"
            type="text"
            maxlength="200"
          >
        </div>

        <div class="form-group author-country-group">
          <label class="form-hint" :for="`author-country-${author.id}`">País</label>
          <input
            :id="`author-country-${author.id}`"
            v-model="author.country"
            class="form-input"
            type="text"
            maxlength="100"
            list="country-options"
            autocomplete="off"
          >
        </div>

        <button
          v-if="authorRows.length > 1"
          type="button"
          class="btn btn-danger author-remove"
          :aria-label="`Remover ${author.name || 'autor'}`"
          @click="removeAuthor(author.id, $event)"
        >
          Remover
        </button>
      </div>

      <datalist id="country-options">
        <option v-for="country in COUNTRIES" :key="country.code" :value="country.label" />
      </datalist>

      <button
        v-if="authorRows.length < 5"
        type="button"
        class="btn btn-secondary add-author-btn"
        @click="addAuthor"
      >
        Adicionar autor
      </button>

      <p v-if="errors.authors" class="error-message">{{ errors.authors }}</p>
    </fieldset>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label" for="work-year">Ano da primeira publicação</label>
        <input
          id="work-year"
          v-model="yearText"
          class="form-input"
          type="number"
          step="1"
          min="-3000"
          max="2100"
          :aria-invalid="Boolean(errors.first_published_year)"
        >
        <p class="form-hint">Use negativo para a.C. - -500 aparece como “500 a.C.”.</p>
        <p v-if="errors.first_published_year" class="error-message">
          {{ errors.first_published_year }}
        </p>
      </div>

      <div class="form-group">
        <label class="form-label" for="work-language">Idioma original</label>
        <select id="work-language" v-model="originalLanguage" class="form-select">
          <option value="">Não informado</option>
          <option v-for="lang in LANGUAGES" :key="lang.code" :value="lang.code">
            {{ lang.label }}
          </option>
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label" for="work-series">Série</label>
        <input
          id="work-series"
          v-model="seriesName"
          class="form-input"
          type="text"
          maxlength="200"
        >
      </div>

      <div class="form-group">
        <label class="form-label" for="work-series-number">Número na série</label>
        <input
          id="work-series-number"
          v-model="seriesNumber"
          class="form-input"
          type="text"
          maxlength="20"
        >
        <p class="form-hint">Texto livre: “1”, “0.1” e “1-2” são todos válidos.</p>
      </div>
    </div>

    <div class="form-group">
      <span class="form-label">Gêneros</span>
      <GenrePicker v-model="genreIds" :max="10" />
    </div>

    <p v-if="serverError" class="error-message server-error" role="alert">{{ serverError }}</p>

    <div class="form-actions">
      <button type="submit" class="btn btn-primary" :disabled="saving">
        {{ saving ? 'Salvando…' : 'Salvar livro' }}
      </button>
      <span v-if="savedAt" class="saved-note" role="status">Alterações salvas.</span>
    </div>
  </form>
</template>

<script setup lang="ts">
import { nextTick, reactive, ref, useId } from 'vue'
import GenrePicker from '~/components/search/GenrePicker.vue'
import { COUNTRIES, countryCodeFor, countryLabelFor } from '~~/shared/constants/countries'
import { LANGUAGES } from '~~/shared/constants/languages'
import type { WorkWithDetails } from '~~/shared/schemas/work'
import { isTimeoutOrAbort, TIMEOUT_MESSAGE } from '~/utils/fetch-error'

const props = defineProps<{ work: WorkWithDetails }>()
const emit = defineEmits<{ (e: 'saved'): void }>()

interface AuthorRow {
  id: string
  name: string
  country: string
}

const authorIdPrefix = useId()
let nextAuthorId = 0

function createAuthorRow(name: string, country: string): AuthorRow {
  return {
    id: `${authorIdPrefix}-author-${nextAuthorId++}`,
    name,
    country,
  }
}

const title = ref(props.work.title)
const yearText = ref(
  props.work.first_published_year === null ? '' : String(props.work.first_published_year),
)
const originalLanguage = ref(props.work.original_language ?? '')
const seriesName = ref(props.work.series_name ?? '')
const seriesNumber = ref(props.work.series_number ?? '')
const genreIds = ref<number[]>(props.work.genres.map((g) => g.id))

const authorRows = reactive<AuthorRow[]>(
  props.work.authors.length > 0
    ? props.work.authors.map((a) =>
        createAuthorRow(a.name, a.country_label ?? countryLabelFor(a.country_code) ?? ''),
      )
    : [createAuthorRow('', '')],
)

const saving = ref(false)
const savedAt = ref<number | null>(null)
const serverError = ref('')
const errors = ref<Record<string, string>>({})

function addAuthor(): void {
  if (authorRows.length >= 5) return
  authorRows.push(createAuthorRow('', ''))
}

function removeAuthor(id: string, event: MouseEvent): void {
  const index = authorRows.findIndex((author) => author.id === id)
  if (authorRows.length <= 1 || index < 0) return

  const row = (event.currentTarget as HTMLElement).closest('.author-row')
  const restoreFocus = Boolean(row?.contains(document.activeElement))
  const nextAuthor = authorRows[index + 1] ?? authorRows[index - 1]
  authorRows.splice(index, 1)

  if (restoreFocus && nextAuthor) {
    void nextTick(() => document.getElementById(`author-name-${nextAuthor.id}`)?.focus())
  }
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function validate(): boolean {
  const next: Record<string, string> = {}

  if (title.value.trim() === '') {
    next.title = 'O título é obrigatório.'
  }

  if (authorRows.every((a) => a.name.trim() === '')) {
    next.authors = 'Informe ao menos um autor.'
  }

  const raw = yearText.value.trim()
  if (raw !== '') {
    const parsed = Number(raw)
    if (!Number.isInteger(parsed)) {
      next.first_published_year = 'Informe um ano inteiro.'
    } else if (parsed < -3000 || parsed > 2100) {
      next.first_published_year = 'O ano deve estar entre -3000 e 2100.'
    }
  }

  errors.value = next
  return Object.keys(next).length === 0
}

async function handleSubmit(): Promise<void> {
  serverError.value = ''
  savedAt.value = null
  if (!validate()) return

  const yearRaw = yearText.value.trim()

  const body = {
    title: title.value.trim(),
    authors: authorRows
      .filter((a) => a.name.trim() !== '')
      .map((a) => {
        const typed = textOrNull(a.country)
        return {
          name: a.name.trim(),
          country_code: countryCodeFor(typed),
          country_label: typed,
        }
      }),
    original_language: originalLanguage.value === '' ? null : originalLanguage.value,
    first_published_year: yearRaw === '' ? null : Number(yearRaw),
    series_name: textOrNull(seriesName.value),
    series_number: textOrNull(seriesNumber.value),
    genre_ids: genreIds.value,
  }

  saving.value = true
  try {
    await $fetch(`/api/works/${props.work.id}` as string, {
      method: 'PATCH',
      body,
      timeout: 15_000,
      retry: 0,
    })
    savedAt.value = Date.now()
    emit('saved')
  } catch (error) {
    serverError.value = isTimeoutOrAbort(error)
      ? TIMEOUT_MESSAGE
      : (error as { data?: { message?: string } })?.data?.message
        ?? 'Não foi possível salvar o livro. Tente novamente.'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.work-edit-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.authors-fieldset {
  border: 1px solid var(--input-bg);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

.author-row {
  display: grid;
  grid-template-columns: 2fr 1.5fr auto;
  gap: var(--space-3);
  align-items: end;
}

.author-name-group,
.author-country-group {
  min-width: 0;
}

.add-author-btn {
  align-self: flex-start;
}

.form-actions {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.saved-note {
  font-size: var(--font-size-sm);
  color: var(--highlight);
}

.server-error {
  margin: 0;
}

@media (max-width: 600px) {
  .author-row {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .author-remove {
    justify-self: flex-start;
  }
}
</style>
