<template>
  <p v-if="showFinishedSummary && finishedPageCount" class="finished-summary">
    Lido por completo · {{ finishedPageCount }} págs.
  </p>
  <section v-else-if="!showFinishedSummary" class="reading-blocks-container" aria-labelledby="reading-progress-title">
    <div class="section-header">
      <div class="header-text">
        <h2 id="reading-progress-title" ref="headingRef" class="section-heading" tabindex="-1">Progresso da leitura</h2>
        <p v-if="progress.pages_read > 0" class="section-subtitle">
          <template v-if="progress.total_pages">
            {{ progress.pages_read }} de {{ progress.total_pages }} páginas lidas ({{ progress.percentage ?? 0 }}%)
          </template>
          <template v-else>
            {{ progress.pages_read }} páginas registradas
          </template>
        </p>
      </div>

      <button
        v-if="isOwner && !showAddForm && blocks.length > 0"
        ref="headerAddBtnRef"
        type="button"
        class="btn btn-secondary btn-sm btn-add-block"
        @click="openAddForm('header')"
      >
        + Registrar trecho lido
      </button>
    </div>

    <p v-if="saveNotice" class="save-notice" role="status" aria-live="polite">
      {{ saveNotice }}
    </p>

    <div v-if="progress.pages_read > 0" class="progress-bar-wrap" role="progressbar" aria-label="Progresso da leitura" :aria-valuenow="progress.percentage ?? 0" aria-valuemin="0" aria-valuemax="100">
      <div class="progress-bar-track">
        <div
          class="progress-bar-fill"
          :style="{ width: `${progress.percentage ?? (progress.pages_read > 0 ? 100 : 0)}%` }"
        />
      </div>
    </div>

    <div v-if="showAddForm || editingBlock" class="block-form-card">
      <h3 class="form-card-title">
        {{ editingBlock ? 'Editar trecho lido' : 'Registrar novo trecho lido' }}
      </h3>

      <form novalidate @submit.prevent="saveBlock">
        <div class="form-pages-row">
          <div class="form-field">
            <label for="block-start-page" class="field-label">Página inicial</label>
            <input
              id="block-start-page"
              v-model.number="formStartPage"
              type="number"
              min="1"
              :max="knownTotalPages ?? undefined"
              required
              class="field-input"
              placeholder="ex: 45"
              :aria-invalid="blockErrors.start_page ? 'true' : undefined"
              :aria-describedby="blockErrors.start_page ? 'block-start-page-error' : undefined"
            >
            <span v-if="blockErrors.start_page" id="block-start-page-error" class="field-error-msg">{{ blockErrors.start_page }}</span>
          </div>

          <div class="form-field">
            <label for="block-end-page" class="field-label">Página final</label>
            <input
              id="block-end-page"
              v-model.number="formEndPage"
              type="number"
              min="1"
              :max="knownTotalPages ?? undefined"
              required
              class="field-input"
              placeholder="ex: 72"
              :aria-invalid="blockErrors.end_page ? 'true' : undefined"
              :aria-describedby="blockErrors.end_page ? 'block-end-page-error' : undefined"
            >
            <span v-if="blockErrors.end_page" id="block-end-page-error" class="field-error-msg">{{ blockErrors.end_page }}</span>
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
          <div class="label-row">
            <label for="block-comment" class="field-label">
              Anotação / Comentário sobre este trecho (opcional)
            </label>
            <span class="char-count" :class="{ 'char-count-limit': formComment.length > COMMENT_MAX }">
              {{ formComment.length.toLocaleString('pt-BR') }} / 5.000
            </span>
          </div>
          <textarea
            id="block-comment"
            v-model="formComment"
            rows="3"
            maxlength="5000"
            class="field-input field-textarea"
            placeholder="O que chamou sua atenção neste trecho?"
            :aria-invalid="blockErrors.comment ? 'true' : undefined"
            :aria-describedby="blockErrors.comment ? 'block-comment-error' : undefined"
          />
          <span v-if="blockErrors.comment" id="block-comment-error" class="field-error-msg">{{ blockErrors.comment }}</span>
        </div>

        <div
          v-if="invalidBlockFields.length > 0"
          class="error-summary"
          role="alert"
        >
          <span>Corrija {{ invalidBlockFields.length === 1 ? '1 campo' : `${invalidBlockFields.length} campos` }}: </span>
          <template v-for="(key, i) in invalidBlockFields" :key="key">
            <button type="button" class="error-summary-link" @click="focusBlockField(key)">{{ BLOCK_FIELD_LABELS[key] }}</button><span v-if="i < invalidBlockFields.length - 1">, </span>
          </template>
          <span>.</span>
        </div>

        <p v-if="formError" class="field-error-msg" role="alert">
          {{ formError }}
        </p>

        <div class="form-btn-row">
          <button
            type="submit"
            class="btn btn-primary btn-save"
            :disabled="saving"
          >
            {{ saving ? 'Salvando...' : 'Salvar trecho' }}
          </button>
          <button
            type="button"
            class="btn btn-secondary btn-cancel"
            :disabled="saving"
            @click="onCancelClick"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>

    <div class="blocks-list">
      <p v-if="isOwner" class="visually-hidden" role="status" aria-live="polite">{{ removeAnnouncement }}</p>
      <div v-if="pendingRemoval" class="undo-strip">
        <span class="undo-msg">Trecho removido.</span>
        <span class="undo-count" aria-hidden="true">{{ pendingSeconds }} s</span>
        <button ref="undoBtnRef" type="button" class="btn btn-ghost btn-sm undo-btn" @click="undoRemove">Desfazer</button>
      </div>

      <p v-if="deleteError" class="field-error-msg" role="alert">
        {{ deleteError }}
      </p>

      <div v-if="blocks.length === 0 && !showAddForm && !pendingRemoval" class="empty-blocks-note">
        <p>{{ progress.pages_read === 0 ? 'Nenhuma página registrada ainda.' : 'Nenhum trecho com anotação registrado.' }}</p>
        <p v-if="isOwner" class="empty-blocks-help">
          Registre até onde leu e, se quiser, uma nota sobre o trecho.
        </p>
        <button
          v-if="isOwner"
          ref="emptyAddBtnRef"
          type="button"
          class="btn btn-secondary empty-blocks-action"
          @click="openAddForm('empty')"
        >
          Registrar trecho lido
        </button>
      </div>

      <article
        v-for="block in blocks"
        :key="block.id"
        class="block-card"
        :data-block-id="block.id"
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
              @click="startRemove(block)"
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useFlash } from '~/composables/useFlash'
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

const showFinishedSummary = computed(() => !props.isOwner && props.isFinished && blocks.value.length === 0)
const finishedPageCount = computed(() => progress.value.total_pages || props.editionPageCount || null)
// Total conhecido de páginas da edição; sem ele não há limite superior no cliente.
const knownTotalPages = computed(() => props.editionPageCount || progress.value.total_pages || null)

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

const showAddForm = ref(false)
const editingBlock = ref<ReadingBlockView | null>(null)
const formStartPage = ref<number | null>(null)
const formEndPage = ref<number | null>(null)
const formComment = ref('')
const formReadAt = ref('')
const formError = ref('')
const deleteError = ref('')
const saving = ref(false)
const saveNotice = ref('')
let noticeTimer: ReturnType<typeof setTimeout> | null = null

const COMMENT_MAX = 5000
type BlockFieldKey = 'start_page' | 'end_page' | 'comment'
const BLOCK_FIELD_ORDER: BlockFieldKey[] = ['start_page', 'end_page', 'comment']
const BLOCK_FIELD_LABELS: Record<BlockFieldKey, string> = {
  start_page: 'Página inicial',
  end_page: 'Página final',
  comment: 'Anotação',
}
const BLOCK_FIELD_IDS: Record<BlockFieldKey, string> = {
  start_page: 'block-start-page',
  end_page: 'block-end-page',
  comment: 'block-comment',
}
const blockErrors = ref<Partial<Record<BlockFieldKey, string>>>({})
const invalidBlockFields = computed(() => BLOCK_FIELD_ORDER.filter((key) => blockErrors.value[key]))

function clearBlockError(key: BlockFieldKey): void {
  if (!blockErrors.value[key]) return
  blockErrors.value = Object.fromEntries(
    Object.entries(blockErrors.value).filter(([k]) => k !== key),
  )
}

watch(formStartPage, () => clearBlockError('start_page'))
watch(formEndPage, () => clearBlockError('end_page'))
watch(formComment, () => clearBlockError('comment'))

async function focusBlockField(key: BlockFieldKey): Promise<void> {
  await nextTick()
  const el = document.getElementById(BLOCK_FIELD_IDS[key])
  if (!el) return
  el.focus({ preventScroll: true })
  const reduce = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView?.({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
}

function isPage(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

function validateBlock(): boolean {
  const errors: Partial<Record<BlockFieldKey, string>> = {}
  const start = formStartPage.value
  const end = formEndPage.value
  const total = knownTotalPages.value
  if (!isPage(start)) {
    errors.start_page = 'Página inicial: informe um número inteiro a partir de 1.'
  } else if (total && start > total) {
    errors.start_page = `Página inicial: o livro tem ${total} páginas.`
  }
  if (!isPage(end)) {
    errors.end_page = 'Página final: informe um número inteiro a partir de 1.'
  } else if (isPage(start) && end < start) {
    errors.end_page = 'Página final: informe um número igual ou maior que a página inicial.'
  } else if (total && end > total) {
    errors.end_page = `Página final: o livro tem ${total} páginas.`
  }
  const length = formComment.value.trim().length
  if (length > COMMENT_MAX) {
    const extra = length - COMMENT_MAX
    errors.comment = `Anotação: o texto tem ${length.toLocaleString('pt-BR')} caracteres e o limite é 5.000. Apague ${extra.toLocaleString('pt-BR')} para poder salvar.`
  }
  blockErrors.value = errors
  return Object.keys(errors).length === 0
}

onBeforeUnmount(() => {
  if (noticeTimer) clearTimeout(noticeTimer)
})

function getTodayString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

// O botão que abriu o formulário some (v-if) enquanto ele está aberto. Ao abrir,
// o foco vai para "Página inicial"; ao fechar, volta para quem abriu, ou para o
// botão do cabeçalho quando o do estado vazio deixou de existir.
type AddOpener = 'header' | 'empty'
const headerAddBtnRef = ref<HTMLButtonElement | null>(null)
const emptyAddBtnRef = ref<HTMLButtonElement | null>(null)
let addOpener: AddOpener | null = null

function returnFocusToAddTrigger(): void {
  const opener = addOpener
  addOpener = null
  if (!opener) return
  void nextTick(() => {
    const target = opener === 'empty'
      ? emptyAddBtnRef.value ?? headerAddBtnRef.value
      : headerAddBtnRef.value ?? emptyAddBtnRef.value
    target?.focus()
  })
}

function onCancelClick(): void {
  const wasAdding = showAddForm.value
  cancelForm()
  if (wasAdding) returnFocusToAddTrigger()
}

function openAddForm(opener: AddOpener = 'header'): void {
  addOpener = opener
  editingBlock.value = null
  const lastEndPage = progress.value.current_page
  formStartPage.value = lastEndPage > 0 ? lastEndPage + 1 : 1
  formEndPage.value = lastEndPage > 0 ? lastEndPage + 10 : 10
  formComment.value = ''
  formReadAt.value = getTodayString()
  formError.value = ''
  blockErrors.value = {}
  showAddForm.value = true
  void nextTick(() => document.getElementById(BLOCK_FIELD_IDS.start_page)?.focus())
}

function startEdit(block: ReadingBlockView): void {
  showAddForm.value = false
  editingBlock.value = block
  formStartPage.value = block.start_page
  formEndPage.value = block.end_page
  formComment.value = block.comment || ''
  formReadAt.value = block.read_at
  formError.value = ''
  blockErrors.value = {}
}

function cancelForm(): void {
  showAddForm.value = false
  editingBlock.value = null
  formError.value = ''
  blockErrors.value = {}
}

async function saveBlock(): Promise<void> {
  formError.value = ''
  if (!validateBlock()) {
    const first = invalidBlockFields.value[0]
    if (first) await focusBlockField(first)
    return
  }

  saving.value = true
  formError.value = ''

  try {
    if (editingBlock.value) {
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

    const wasEditing = Boolean(editingBlock.value)
    updateLocalProgress()
    cancelForm()
    if (!wasEditing) returnFocusToAddTrigger()
    saveNotice.value = wasEditing ? 'Trecho atualizado.' : 'Trecho salvo.'
    if (noticeTimer) clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => { saveNotice.value = '' }, 4000)
  } catch (err: unknown) {
    formError.value = err instanceof Error ? err.message : 'Ocorreu um erro ao salvar.'
  } finally {
    saving.value = false
  }
}

// Excluir segue o padrão da remoção de leitura: o trecho sai da lista na
// hora, "Desfazer" fica disponível por 6 s e o DELETE só sai quando a
// contagem acaba. Sair da página durante a contagem confirma a exclusão.
const UNDO_SECONDS = 6
const LEAVE_FAILED_FLASH = 'Não foi possível excluir o trecho. Ele continua na leitura.'
interface PendingRemoval {
  block: ReadingBlockView
  index: number
}
const pendingRemoval = ref<PendingRemoval | null>(null)
const pendingSeconds = ref(0)
const removeAnnouncement = ref('')
const undoBtnRef = ref<HTMLButtonElement | null>(null)
const headingRef = ref<HTMLElement | null>(null)
let undoTimer: ReturnType<typeof setInterval> | null = null
const flash = props.isOwner ? useFlash() : null

function clearUndoTimer(): void {
  if (undoTimer) {
    clearInterval(undoTimer)
    undoTimer = null
  }
}

function restoreBlock(removal: PendingRemoval): void {
  if (blocks.value.some((b) => b.id === removal.block.id)) return
  const index = Math.min(removal.index, blocks.value.length)
  blocks.value.splice(index, 0, removal.block)
  updateLocalProgress()
}

function focusBlockDelete(blockId: string): void {
  void nextTick(() => {
    document
      .querySelector<HTMLElement>(`[data-block-id="${blockId}"] .btn-icon-delete`)
      ?.focus()
  })
}

function sendDelete(blockId: string, keepalive = false): Promise<Response> {
  return fetch(`/api/logs/${props.logId}/blocks/${blockId}`, {
    method: 'DELETE',
    credentials: 'same-origin',
    keepalive,
  })
}

function startRemove(block: ReadingBlockView): void {
  // Um segundo "Excluir" durante a contagem confirma o anterior na hora.
  if (pendingRemoval.value) void commitRemoval()
  if (editingBlock.value?.id === block.id) cancelForm()

  const index = blocks.value.findIndex((b) => b.id === block.id)
  if (index === -1) return
  deleteError.value = ''
  blocks.value.splice(index, 1)
  updateLocalProgress()

  pendingRemoval.value = { block, index }
  pendingSeconds.value = UNDO_SECONDS
  removeAnnouncement.value = `Trecho removido. Desfazer em ${UNDO_SECONDS} segundos.`
  void nextTick(() => undoBtnRef.value?.focus())
  clearUndoTimer()
  undoTimer = setInterval(() => {
    pendingSeconds.value -= 1
    if (pendingSeconds.value <= 0) void commitRemoval()
  }, 1000)
}

function undoRemove(): void {
  const removal = pendingRemoval.value
  if (!removal) return
  clearUndoTimer()
  pendingRemoval.value = null
  pendingSeconds.value = 0
  restoreBlock(removal)
  removeAnnouncement.value = 'Exclusão cancelada.'
  focusBlockDelete(removal.block.id)
}

async function commitRemoval(): Promise<void> {
  const removal = pendingRemoval.value
  if (!removal) return
  const hadFocus = document.activeElement === undoBtnRef.value
  clearUndoTimer()
  pendingRemoval.value = null
  pendingSeconds.value = 0
  if (hadFocus) void nextTick(() => headingRef.value?.focus())

  try {
    const res = await sendDelete(removal.block.id)
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { message?: string } | null
      throw new Error(body?.message || 'Não foi possível excluir o trecho.')
    }
    removeAnnouncement.value = 'Trecho excluído.'
  } catch (err: unknown) {
    restoreBlock(removal)
    const reason = err instanceof Error ? err.message : 'Não foi possível excluir o trecho.'
    deleteError.value = `${reason} O trecho voltou para a lista.`
  }
}

// Navegação dentro do app: o componente desmonta e o pedido sai na hora;
// o resultado ruim aparece como aviso na página seguinte.
function removeOnLeave(): void {
  const removal = pendingRemoval.value
  if (!removal) return
  clearUndoTimer()
  pendingRemoval.value = null
  pendingSeconds.value = 0
  sendDelete(removal.block.id, true)
    .then((res) => {
      if (!res.ok) flash?.set(LEAVE_FAILED_FLASH, 'error')
    })
    .catch(() => flash?.set(LEAVE_FAILED_FLASH, 'error'))
}

// Fechar a aba ou recarregar: só `keepalive` sobrevive ao descarregamento.
function onPageHide(): void {
  const removal = pendingRemoval.value
  if (!removal) return
  clearUndoTimer()
  pendingRemoval.value = null
  pendingSeconds.value = 0
  void sendDelete(removal.block.id, true).catch(() => {})
}

onMounted(() => {
  window.addEventListener('pagehide', onPageHide)
})

onBeforeUnmount(() => {
  window.removeEventListener('pagehide', onPageHide)
  removeOnLeave()
  clearUndoTimer()
})

function formatBlockDate(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}
</script>

<style scoped>
.finished-summary {
  margin: 0 0 var(--space-6);
  font-size: var(--font-size-sm);
  color: var(--text-color);
}

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
  color: var(--text-bright);
  margin: 0;
}

.section-heading:focus {
  outline: none;
}

.section-heading:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.undo-strip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px dashed var(--input-bg);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  color: var(--text-bright);
}

.undo-count {
  color: var(--text-color);
  font-variant-numeric: tabular-nums;
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-2);
}

.char-count {
  font-size: var(--font-size-xs);
  color: var(--text-color);
  font-variant-numeric: tabular-nums;
}

.char-count-limit {
  color: var(--danger-text);
  font-weight: 600;
}

.error-summary {
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--danger);
  border-radius: var(--radius-sm);
  color: var(--text-bright);
  font-size: var(--font-size-sm);
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
  text-decoration-color: var(--danger-text);
  text-underline-offset: 0.2em;
  cursor: pointer;
}

.error-summary-link:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.section-help,
.save-notice {
  font-size: var(--font-size-sm);
  color: var(--text-color);
  margin: 0 0 var(--space-4);
}

.save-notice {
  color: var(--success);
}

.section-subtitle {
  font-size: var(--font-size-sm);
  color: var(--text-color);
  margin: var(--space-1) 0 0;
}

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
  background-color: var(--highlight);
  border-radius: var(--radius-full);
}

.block-form-card {
  background-color: var(--bg-color);
  border: 1px solid var(--input-bg);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  margin-bottom: var(--space-6);
}

.form-card-title {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--text-bright);
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
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-bright);
  padding: var(--space-2);
  min-height: var(--target-min-size);
  box-sizing: border-box;
  font-size: var(--font-size-sm);
  font-family: inherit;
  outline: none;
}

.field-input:focus {
  border-color: var(--highlight);
  box-shadow: 0 0 0 2px var(--highlight-glow);
}

.field-input[aria-invalid='true'] {
  border-color: var(--danger);
}

.field-textarea {
  resize: vertical;
  min-height: 70px;
}

.field-error-msg {
  color: var(--danger-text);
  font-size: var(--font-size-xs);
  margin: var(--space-1) 0 0;
}

.form-btn-row {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.blocks-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.empty-blocks-note {
  padding: var(--space-2) 0 var(--space-4);
  color: var(--text-color);
  font-size: var(--font-size-sm);
}

.empty-blocks-note p {
  margin: 0;
}

.empty-blocks-note .empty-blocks-help {
  margin-top: var(--space-1);
  color: var(--text-color);
}

.empty-blocks-action {
  margin-top: var(--space-3);
}

.block-card {
  border: 1px solid var(--input-bg);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
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
  color: var(--text-bright);
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
  color: var(--text-bright);
  background-color: var(--input-bg);
}

.btn-icon-delete:hover {
  color: var(--danger-text);
  background-color: var(--input-bg);
}

.btn-icon:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.block-comment {
  margin: var(--space-2) 0 0;
  font-size: var(--font-size-sm);
  color: var(--text-bright);
  line-height: var(--line-height-relaxed);
  white-space: pre-wrap;
}
</style>
