<template>
  <section class="discussion-thread" aria-label="Comentários">
    <button
      type="button"
      class="discussion-toggle"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="toggle"
    >
      Comentários
    </button>
    <div v-if="open" :id="panelId" class="discussion-panel">
      <p v-if="loading && !loaded" role="status">Carregando comentários…</p>
      <div v-if="loadError" class="discussion-error" role="alert">
        <p>{{ loadError }}</p>
        <button type="button" class="btn btn-sm" :disabled="loading" @click="loadComments(Boolean(nextCursor))">Tentar de novo</button>
      </div>
      <p v-if="loaded && comments.length === 0" class="discussion-empty">Nenhum comentário ainda.</p>
      <ol v-if="comments.length" class="discussion-list">
        <li v-for="comment in comments" :key="comment.id" class="discussion-comment">
          <div class="discussion-meta">
            <NuxtLink :to="`/@${comment.user.handle}`">{{ comment.user.display_name || `@${comment.user.handle}` }}</NuxtLink>
            <time :datetime="String(comment.created_at)" :title="formatFullDate(comment.created_at)">{{ formatRelativeDate(comment.created_at) }}</time>
            <button v-if="comment.can_delete" type="button" class="discussion-delete" :disabled="deleting" @click="pendingDeleteId = comment.id">Excluir</button>
          </div>
          <p class="discussion-body">{{ comment.body }}</p>
          <div v-if="pendingDeleteId === comment.id" class="discussion-confirm">
            <span>Excluir este comentário?</span>
            <button type="button" class="btn btn-sm btn-danger" :disabled="deleting" @click="removeComment(comment.id)">{{ deleting ? 'Excluindo…' : 'Excluir comentário' }}</button>
            <button type="button" class="btn btn-sm" :disabled="deleting" @click="pendingDeleteId = null">Cancelar</button>
          </div>
        </li>
      </ol>
      <p v-if="deleteError" class="discussion-error" role="alert">{{ deleteError }}</p>
      <button v-if="nextCursor" type="button" class="btn btn-sm" :disabled="loading" @click="loadComments(true)">{{ loading ? 'Carregando…' : 'Carregar mais comentários' }}</button>
      <form v-if="authenticated" class="discussion-form" @submit.prevent="submit">
        <label :for="inputId">Seu comentário</label>
        <textarea
          :id="inputId"
          v-model="draft"
          class="form-textarea"
          rows="3"
          maxlength="2000"
          :disabled="sending"
          :aria-invalid="submitError ? 'true' : undefined"
          :aria-describedby="submitError ? errorId : undefined"
          placeholder="Comente sobre esta leitura…"
        />
        <p v-if="submitError" :id="errorId" class="discussion-error" role="alert">{{ submitError }}</p>
        <button type="submit" class="btn btn-sm" :disabled="sending || loading">{{ sending ? 'Enviando…' : 'Comentar' }}</button>
      </form>
      <p v-else class="discussion-login"><NuxtLink to="/entrar">Entre para comentar.</NuxtLink></p>
      <p class="visually-hidden" role="status" aria-live="polite">{{ announcement }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { formatFullDate, formatRelativeDate } from '~/utils/date'
import type { CommentView } from '~~/shared/schemas/comment'

const props = withDefaults(defineProps<{ logId: string; blockId?: string; initiallyOpen?: boolean }>(), { blockId: undefined, initiallyOpen: false })
const session = useState<{ user?: { id?: string } | null }>('auth:session', () => ({ user: null }))
const authenticated = computed(() => Boolean(session.value?.user?.id))
const uid = useId()
const panelId = `discussion-${uid}`
const inputId = `discussion-input-${uid}`
const errorId = `discussion-error-${uid}`
const open = ref(props.initiallyOpen)
const comments = ref<CommentView[]>([])
const nextCursor = ref<string | null>(null)
const loaded = ref(false)
const loading = ref(false)
const sending = ref(false)
const deleting = ref(false)
const loadError = ref('')
const submitError = ref('')
const deleteError = ref('')
const draft = ref('')
const pendingDeleteId = ref<string | null>(null)
const announcement = ref('')
const endpoint = computed(() => `/api/logs/${props.logId}/comments`)
let generation = 0

function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const data = error.data
    if (typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string') return data.message
  }
  return fallback
}

function subMillisecondTime(value: Date | string): number {
  if (value instanceof Date) return 0
  const fraction = value.match(/\.(\d+)/)?.[1] ?? ''
  return Number(fraction.padEnd(6, '0').slice(3, 6))
}

async function loadComments(more = false) {
  if (loading.value) return
  const current = generation
  loading.value = true
  loadError.value = ''
  try {
    const result = await $fetch<{ comments: CommentView[]; nextCursor?: string | null }>(endpoint.value, {
      query: { block_id: props.blockId, cursor: more ? nextCursor.value : undefined }, retry: 0, timeout: 10000,
    })
    if (current !== generation) return
    const previous = more ? comments.value : []
    const ids = new Set(previous.map((comment) => comment.id))
    comments.value = [...previous, ...result.comments.filter((comment) => !ids.has(comment.id))].sort((a, b) => {
      const time = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      return time || subMillisecondTime(a.created_at) - subMillisecondTime(b.created_at) || a.id.localeCompare(b.id)
    })
    nextCursor.value = result.nextCursor ?? null
    loaded.value = true
  } catch (error) {
    if (current === generation) loadError.value = errorMessage(error, 'Não foi possível carregar os comentários.')
  } finally {
    if (current === generation) loading.value = false
  }
}

function toggle() {
  open.value = !open.value
  if (open.value && !loaded.value) void loadComments()
}

async function submit() {
  if (sending.value || loading.value || !authenticated.value) return
  const body = draft.value.trim()
  if (!body || body.length > 2000) {
    submitError.value = 'Escreva um comentário de 1 a 2.000 caracteres.'
    return
  }
  const current = generation
  sending.value = true
  submitError.value = ''
  try {
    const created = await $fetch<CommentView>(endpoint.value, { method: 'POST', body: { body, block_id: props.blockId ?? null }, retry: 0, timeout: 10000 })
    if (current !== generation) return
    comments.value.push(created)
    loaded.value = true
    draft.value = ''
    announcement.value = 'Comentário publicado.'
  } catch (error) {
    if (current === generation) submitError.value = errorMessage(error, 'Não foi possível publicar o comentário. Seu texto continua aqui.')
  } finally {
    if (current === generation) sending.value = false
  }
}

async function removeComment(id: string) {
  if (deleting.value) return
  const current = generation
  deleting.value = true
  deleteError.value = ''
  try {
    await $fetch(`${endpoint.value}/${id}`, { method: 'DELETE', retry: 0, timeout: 10000 })
    if (current !== generation) return
    comments.value = comments.value.filter((comment) => comment.id !== id)
    pendingDeleteId.value = null
    announcement.value = 'Comentário excluído.'
  } catch (error) {
    if (current === generation) deleteError.value = errorMessage(error, 'Não foi possível excluir o comentário.')
  } finally {
    if (current === generation) deleting.value = false
  }
}

watch(() => [props.logId, props.blockId], () => {
  generation++
  comments.value = []
  loaded.value = false
  loading.value = false
  sending.value = false
  deleting.value = false
  nextCursor.value = null
  draft.value = ''
  loadError.value = ''
  submitError.value = ''
  deleteError.value = ''
  pendingDeleteId.value = null
  announcement.value = ''
  if (open.value) void loadComments()
})
onMounted(() => { if (open.value) void loadComments() })
onBeforeUnmount(() => { generation++ })
</script>

<style scoped>
.discussion-thread { margin-top: var(--space-4); font-size: var(--font-size-sm); }
.discussion-toggle { background: none; border: 0; color: var(--text-color); padding: var(--space-2) 0; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; min-height: 36px; }
.discussion-toggle:hover, .discussion-toggle[aria-expanded='true'] { color: var(--highlight); }
.discussion-panel { padding-top: var(--space-3); }
.discussion-list { list-style: none; padding: 0; margin: 0; }
.discussion-comment { padding: var(--space-3) 0; border-bottom: 1px solid var(--input-bg); }
.discussion-meta { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-3); color: var(--text-color); }
.discussion-meta a { color: var(--text-bright); }
.discussion-meta time { font-size: var(--font-size-xs); }
.discussion-body { white-space: pre-wrap; overflow-wrap: anywhere; margin: var(--space-2) 0 0; line-height: 1.6; }
.discussion-delete { margin-left: auto; background: none; border: 0; color: var(--text-color); cursor: pointer; min-height: 36px; }
.discussion-delete:hover { color: var(--danger-text); }
.discussion-confirm { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3); }
.discussion-form { display: flex; align-items: flex-start; flex-direction: column; gap: var(--space-2); margin-top: var(--space-4); }
.discussion-form textarea { width: 100%; min-height: 80px; }
.discussion-error { color: var(--danger-text); }
.discussion-empty, .discussion-login { color: var(--text-color); }
.discussion-login a { color: var(--highlight); }
</style>
