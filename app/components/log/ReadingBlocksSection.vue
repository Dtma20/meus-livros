<template>
  <section class="reading-blocks-container" aria-labelledby="reading-progress-title">
    <div class="section-header">
      <div class="header-text">
        <h2 id="reading-progress-title" class="section-heading">Progresso da leitura</h2>
        <p class="section-subtitle">
          <template v-if="progress.total_pages">
            {{ progress.pages_read }} de {{ progress.total_pages }} páginas lidas ({{ progress.percentage ?? 0 }}%)
          </template>
          <template v-else-if="progress.pages_read > 0">
            {{ progress.pages_read }} páginas registradas
          </template>
          <template v-else>
            Nenhuma página registrada ainda
          </template>
        </p>
      </div>

      <button
        v-if="isOwner && !showAddForm"
        type="button"
        class="btn-add-block"
        @click="openAddForm"
      >
        + Registrar trecho lido
      </button>
    </div>

    <!-- Visual Progress Bar -->
    <div class="progress-bar-wrap" role="progressbar" :aria-valuenow="progress.percentage ?? 0" aria-valuemin="0" aria-valuemax="100">
      <div class="progress-bar-track">
        <div
          class="progress-bar-fill"
          :style="{ width: `${progress.percentage ?? (progress.pages_read > 0 ? 100 : 0)}%` }"
        />
      </div>
    </div>

    <!-- Add/Edit Block Form -->
    <div v-if="showAddForm || editingBlock" class="block-form-card">
      <h3 class="form-card-title">
        {{ editingBlock ? 'Editar trecho lido' : 'Registrar novo trecho lido' }}
      </h3>

      <form @submit.prevent="saveBlock">
        <div class="form-pages-row">
          <div class="form-field">
            <label for="block-start-page" class="field-label">Página inicial</label>
            <input
              id="block-start-page"
              v-model.number="formStartPage"
              type="number"
              min="1"
              required
              class="field-input"
              placeholder="ex: 45"
            >
          </div>

          <div class="form-field">
            <label for="block-end-page" class="field-label">Página final</label>
            <input
              id="block-end-page"
              v-model.number="formEndPage"
              type="number"
              min="1"
              required
              class="field-input"
              placeholder="ex: 72"
            >
          </div>

          <div class="form-field">
            <label for="block-read-at" class="field-label">Data</label>
            <input
              id="block-read-at"
              v-model="formReadAt"
              type="date"
              required
              class="field-input"
            >
          </div>
        </div>

        <div class="form-field mt-3">
          <label for="block-comment" class="field-label">
            Anotação / Comentário sobre este trecho (opcional)
          </label>
          <textarea
            id="block-comment"
            v-model="formComment"
            rows="3"
            maxlength="5000"
            class="field-input field-textarea"
            placeholder="O que chamou sua atenção neste trecho?"
          />
        </div>

        <p v-if="formError" class="field-error-msg" role="alert">
          {{ formError }}
        </p>

        <div class="form-btn-row">
          <button
            type="submit"
            class="btn-save"
            :disabled="saving"
          >
            {{ saving ? 'Salvando...' : 'Salvar trecho' }}
          </button>
          <button
            type="button"
            class="btn-cancel"
            :disabled="saving"
            @click="cancelForm"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>

    <!-- Timeline of Blocks -->
    <div class="blocks-list">
      <p v-if="deleteError" class="field-error-msg" role="alert">
        {{ deleteError }}
      </p>

      <div v-if="blocks.length === 0 && !showAddForm" class="empty-blocks-note">
        <p>Nenhum trecho com anotação registrado para esta leitura.</p>
        <button
          v-if="isOwner"
          type="button"
          class="empty-blocks-action"
          @click="openAddForm"
        >
          Registrar o primeiro trecho
        </button>
      </div>

      <article
        v-for="block in blocks"
        :key="block.id"
        class="block-card"
      >
        <div class="block-card-header">
          <div class="block-page-range">
            <span class="page-badge">
              Páginas {{ block.start_page }} a {{ block.end_page }}
            </span>
            <span class="page-count-badge">
              {{ block.end_page - block.start_page + 1 }} {{ (block.end_page - block.start_page + 1) === 1 ? 'página' : 'páginas' }}
            </span>
            <time class="block-date" :datetime="block.read_at">
              {{ formatBlockDate(block.read_at) }}
            </time>
          </div>

          <div v-if="isOwner" class="block-actions">
            <button
              type="button"
              class="btn-icon"
              title="Editar trecho"
              aria-label="Editar trecho"
              @click="startEdit(block)"
            >
              Editar
            </button>
            <button
              type="button"
              class="btn-icon btn-icon-delete"
              title="Excluir trecho"
              aria-label="Excluir trecho"
              @click="confirmDelete(block)"
            >
              Excluir
            </button>
          </div>
        </div>

        <p v-if="block.comment" class="block-comment">
          {{ block.comment }}
        </p>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ReadingBlockView, ReadingProgressView } from '~~/shared/schemas/reading-block'
import { calculateReadingProgress } from '~~/shared/utils/reading-progress'

const props = withDefaults(
  defineProps<{
    logId: string
    initialBlocks?: ReadingBlockView[]
    initialProgress?: ReadingProgressView
    isOwner?: boolean
    editionPageCount?: number | null
    isFinished?: boolean
  }>(),
  {
    initialBlocks: () => [],
    initialProgress: () => ({
      pages_read: 0,
      current_page: 0,
      total_pages: null,
      percentage: null,
      is_complete: false,
    }),
    isOwner: false,
    editionPageCount: null,
    isFinished: false,
  },
)

const emit = defineEmits<{
  (e: 'update:progress', progress: ReadingProgressView): void
}>()

const blocks = ref<ReadingBlockView[]>([...props.initialBlocks])
const progress = ref<ReadingProgressView>({ ...props.initialProgress })

watch(
  () => props.initialBlocks,
  (newBlocks) => {
    if (newBlocks) blocks.value = [...newBlocks]
  },
  { deep: true },
)

watch(
  () => props.initialProgress,
  (newProg) => {
    if (newProg) progress.value = { ...newProg }
  },
  { deep: true },
)

function updateLocalProgress(): void {
  const intervals = blocks.value.map((b) => ({
    start_page: b.start_page,
    end_page: b.end_page,
  }))
  const calc = calculateReadingProgress(
    intervals,
    props.editionPageCount,
    props.isFinished,
  )
  progress.value = {
    pages_read: calc.pagesRead,
    current_page: calc.currentPage,
    total_pages: calc.totalPages,
    percentage: calc.percentage,
    is_complete: calc.isComplete,
  }
  emit('update:progress', progress.value)
}

// Form state
const showAddForm = ref(false)
const editingBlock = ref<ReadingBlockView | null>(null)
const formStartPage = ref<number | null>(null)
const formEndPage = ref<number | null>(null)
const formComment = ref('')
const formReadAt = ref('')
const formError = ref('')
const deleteError = ref('')
const saving = ref(false)

function getTodayString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function openAddForm(): void {
  editingBlock.value = null
  const lastEndPage = progress.value.current_page
  formStartPage.value = lastEndPage > 0 ? lastEndPage + 1 : 1
  formEndPage.value = lastEndPage > 0 ? lastEndPage + 10 : 10
  formComment.value = ''
  formReadAt.value = getTodayString()
  formError.value = ''
  showAddForm.value = true
}

function startEdit(block: ReadingBlockView): void {
  showAddForm.value = false
  editingBlock.value = block
  formStartPage.value = block.start_page
  formEndPage.value = block.end_page
  formComment.value = block.comment || ''
  formReadAt.value = block.read_at
  formError.value = ''
}

function cancelForm(): void {
  showAddForm.value = false
  editingBlock.value = null
  formError.value = ''
}

async function saveBlock(): Promise<void> {
  if (!formStartPage.value || formStartPage.value < 1) {
    formError.value = 'A página inicial deve ser maior ou igual a 1.'
    return
  }
  if (!formEndPage.value || formEndPage.value < formStartPage.value) {
    formError.value = 'A página final deve ser maior ou igual à página inicial.'
    return
  }

  saving.value = true
  formError.value = ''

  try {
    if (editingBlock.value) {
      // PATCH
      const res = await fetch(`/api/logs/${props.logId}/blocks/${editingBlock.value.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_page: formStartPage.value,
          end_page: formEndPage.value,
          comment: formComment.value.trim() || null,
          read_at: formReadAt.value,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Falha ao salvar alterações.')
      }
      const updated = (await res.json()) as ReadingBlockView
      const idx = blocks.value.findIndex((b) => b.id === updated.id)
      if (idx !== -1) {
        blocks.value[idx] = updated
      }
    } else {
      // POST
      const res = await fetch(`/api/logs/${props.logId}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_page: formStartPage.value,
          end_page: formEndPage.value,
          comment: formComment.value.trim() || null,
          read_at: formReadAt.value,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Falha ao salvar trecho.')
      }
      const created = (await res.json()) as ReadingBlockView
      blocks.value.unshift(created)
    }

    updateLocalProgress()
    cancelForm()
  } catch (err: unknown) {
    formError.value = err instanceof Error ? err.message : 'Ocorreu um erro ao salvar.'
  } finally {
    saving.value = false
  }
}

async function confirmDelete(block: ReadingBlockView): Promise<void> {
  const confirmed = window.confirm(`Deseja excluir o registro das páginas ${block.start_page} a ${block.end_page}?`)
  if (!confirmed) return

  deleteError.value = ''
  try {
    const res = await fetch(`/api/logs/${props.logId}/blocks/${block.id}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.message || 'Não foi possível excluir o trecho.')
    }
    blocks.value = blocks.value.filter((b) => b.id !== block.id)
    updateLocalProgress()
  } catch (err: unknown) {
    deleteError.value = err instanceof Error ? err.message : 'Não foi possível excluir o trecho. Tente novamente.'
  }
}

function formatBlockDate(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}
</script>

<style scoped>
.reading-blocks-container {
  margin-top: var(--space-6);
  padding-top: var(--space-6);
  border-top: 1px solid var(--input-bg);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-4);
  margin-bottom: var(--space-3);
  flex-wrap: wrap;
}

.section-heading {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.section-subtitle {
  font-size: var(--font-size-sm);
  color: var(--text-color);
  margin: var(--space-1) 0 0;
}

.btn-add-block {
  background-color: transparent;
  color: var(--highlight);
  border: 1px solid var(--highlight);
  border-radius: var(--radius-md);
  padding: var(--space-1) var(--space-3);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-add-block:hover {
  background-color: rgba(99, 102, 241, 0.1);
}

/* Progress bar */
.progress-bar-wrap {
  width: 100%;
  margin-bottom: var(--space-6);
}

.progress-bar-track {
  width: 100%;
  height: 8px;
  background-color: var(--input-bg);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #a855f7);
  border-radius: var(--radius-full);
  transition: width 0.4s ease;
}

/* Form Card */
.block-form-card {
  background-color: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--input-bg);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  margin-bottom: var(--space-6);
}

.form-card-title {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: #fff;
  margin-top: 0;
  margin-bottom: var(--space-3);
}

.form-pages-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: var(--space-3);
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.mt-3 {
  margin-top: var(--space-3);
}

.field-label {
  font-size: var(--font-size-xs);
  color: var(--text-color);
  font-weight: 500;
}

.field-input {
  background-color: var(--input-bg);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-sm);
  color: #fff;
  padding: var(--space-2);
  font-size: var(--font-size-sm);
  outline: none;
}

.field-input:focus {
  border-color: var(--highlight);
}

.field-textarea {
  resize: vertical;
  min-height: 70px;
}

.field-error-msg {
  color: #f87171;
  font-size: var(--font-size-xs);
  margin: var(--space-2) 0 0;
}

.form-btn-row {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.btn-save {
  background-color: var(--highlight);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-4);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
}

.btn-save:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-cancel {
  background: transparent;
  color: var(--text-color);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-4);
  font-size: var(--font-size-sm);
  cursor: pointer;
}

/* Block Cards */
.blocks-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.empty-blocks-note {
  text-align: center;
  padding: var(--space-6) var(--space-4);
  color: var(--text-color);
  font-size: var(--font-size-sm);
}

.empty-blocks-action {
  background: none;
  border: none;
  color: var(--highlight);
  text-decoration: underline;
  cursor: pointer;
  font-size: var(--font-size-sm);
  margin-top: var(--space-2);
}

.block-card {
  background-color: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  transition: border-color 0.15s;
}

.block-card:hover {
  border-color: rgba(255, 255, 255, 0.12);
}

.block-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.block-page-range {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.page-badge {
  font-weight: 600;
  font-size: var(--font-size-sm);
  color: #fff;
}

.page-count-badge {
  font-size: var(--font-size-xs);
  color: var(--text-color);
  background-color: var(--input-bg);
  padding: 1px 6px;
  border-radius: var(--radius-full);
}

.block-date {
  font-size: var(--font-size-xs);
  color: var(--text-color);
  opacity: 0.7;
}

.block-actions {
  display: flex;
  gap: var(--space-2);
}

.btn-icon {
  background: none;
  border: none;
  color: var(--text-color);
  font-size: var(--font-size-xs);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.btn-icon:hover {
  color: #fff;
  background-color: rgba(255, 255, 255, 0.05);
}

.btn-icon-delete:hover {
  color: #f87171;
  background-color: rgba(239, 68, 68, 0.1);
}

.block-comment {
  margin: var(--space-2) 0 0;
  font-size: var(--font-size-sm);
  color: #e2e8f0;
  line-height: var(--line-height-relaxed);
  white-space: pre-wrap;
}
</style>
