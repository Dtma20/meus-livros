<template>
  <div class="entry-page">
    <div v-if="isPending" class="entry-status-wrap" role="status">
      <LoadingSkeleton :count="1" />
    </div>

    <div v-else-if="hasError || !logData" class="entry-status-wrap" role="status">
      <EmptyState
        v-if="is404"
        heading-tag="h1"
        title="Entrada não encontrada"
        message="Esta entrada não existe, foi removida ou é privada."
        action-label="Ir para o início"
        action-href="/"
      />
      <ErrorState
        v-else
        heading-tag="h1"
        title="Algo deu errado. Tente de novo."
        action-label="Tentar de novo"
        @retry="refresh"
      />
    </div>

    <article v-else class="entry-article">
      <header class="entry-header">
        <NuxtLink :to="`/@${logData.user.handle}`" class="reader-link">
          <template v-if="isOwner">
            <span class="reader-prefix">Sua biblioteca </span>
            <span class="reader-handle">@{{ logData.user.handle }}</span>
          </template>
          <template v-else>
            <span class="reader-prefix">Biblioteca de </span>
            <strong class="reader-name">{{ logData.user.display_name }} </strong>
            <span class="reader-handle">@{{ logData.user.handle }}</span>
          </template>
        </NuxtLink>

        <span
          v-if="logData.visibility === 'privado'"
          class="private-badge"
          title="Esta entrada é visível apenas para você"
        >
          Registro privado
        </span>
      </header>

      <div class="entry-layout">
      <div class="book-card-section">
        <div class="cover-container">
          <BookCover
            :alt="authorsText ? `Capa de ${logData.work.title}, de ${authorsText}` : `Capa de ${logData.work.title}`"
            :title="logData.work.title"
            :cover-url="logData.edition?.cover_url ?? logData.work.cover_url"
            :ol-cover-id="logData.edition?.ol_cover_id"
            :isbn13="logData.edition?.isbn13"
          />
        </div>

        <div class="book-details">
          <h1 class="work-title">
            <NuxtLink :to="`/livro/${logData.work.slug}`" class="title-link">
              {{ logData.work.title }}
            </NuxtLink>
            <span v-if="publishedYear" class="published-year">({{ publishedYear }})</span>
          </h1>

          <p v-if="authorsText" class="work-authors">
            {{ authorsText }}
          </p>

          <div v-if="logData.rating" class="rating-box">
            <StarRating :rating="logData.rating" />
          </div>

          <div class="metadata-pills">
            <span v-if="readingDateText" class="meta-pill">
              {{ readingDateText }}
            </span>
            <span v-if="formatText" class="meta-pill">
              {{ formatText }}
            </span>
            <span v-if="logData.edition?.publisher" class="meta-pill publisher-pill">
              {{ logData.edition.publisher }}
            </span>
            <span v-if="logData.edition?.page_count" class="meta-pill">
              {{ logData.edition.page_count }} págs.
            </span>
          </div>

          <div class="actions-row">
            <NuxtLink
              v-if="isOwner && !logData.finished_on"
              :to="`/app/entrada/${logData.id}/editar?terminar=1`"
              class="btn btn-secondary finish-btn"
              :aria-label="`Terminei ${logData.work.title}`"
            >
              <svg
                class="btn-icon"
                viewBox="0 0 24 24"
                width="15"
                height="15"
                stroke="currentColor"
                stroke-width="2.5"
                fill="none"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Terminei</span>
            </NuxtLink>

            <button
              type="button"
              class="btn btn-secondary share-btn"
              :class="{ 'is-copied': copied }"
              :aria-label="copied ? 'Link copiado para a área de transferência' : 'Compartilhar esta entrada'"
              @click="handleShare"
            >
              <svg
                v-if="!copied"
                class="btn-icon"
                viewBox="0 0 24 24"
                width="15"
                height="15"
                stroke="currentColor"
                stroke-width="2"
                fill="none"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <svg
                v-else
                class="btn-icon"
                viewBox="0 0 24 24"
                width="15"
                height="15"
                stroke="currentColor"
                stroke-width="2.5"
                fill="none"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{{ copied ? 'Link copiado!' : 'Compartilhar' }}</span>
            </button>

            <NuxtLink
              v-if="isOwner"
              :to="`/app/entrada/${logData.id}/editar`"
              class="btn btn-secondary edit-btn"
            >
              <svg
                class="btn-icon"
                viewBox="0 0 24 24"
                width="14"
                height="14"
                stroke="currentColor"
                stroke-width="2"
                fill="none"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
              </svg>
              <span>Editar</span>
            </NuxtLink>

            <button
              v-if="isOwner && pendingSeconds === 0 && !isDeleting && !deleteError"
              ref="removeBtnRef"
              type="button"
              class="btn btn-danger delete-btn"
              @click="startDelete"
            >
              <svg
                class="btn-icon"
                viewBox="0 0 24 24"
                width="13"
                height="13"
                stroke="currentColor"
                stroke-width="2"
                fill="none"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              <span>Remover</span>
            </button>
          </div>

          <div v-if="isOwner && (pendingSeconds > 0 || isDeleting || deleteError)" class="remove-zone">
            <p class="visually-hidden" role="status" aria-live="polite">{{ removeAnnouncement }}</p>
            <template v-if="pendingSeconds > 0">
              <span class="remove-msg" aria-hidden="true">Esta leitura será removida em {{ pendingSeconds }} s.</span>
              <button ref="undoBtnRef" type="button" class="btn btn-ghost btn-sm undo-btn" @click="undoDelete">Desfazer</button>
            </template>
            <template v-else-if="isDeleting">
              <span class="remove-msg" aria-hidden="true">Removendo...</span>
            </template>
            <template v-else-if="deleteError">
              <span class="remove-msg remove-error" aria-hidden="true">{{ deleteError }}</span>
              <button type="button" class="btn btn-ghost btn-sm undo-btn" @click="startDelete">Tentar de novo</button>
            </template>
          </div>
        </div>
      </div>

      <div class="entry-main">
      <template v-for="part in sectionOrder" :key="part">
        <section v-if="part === 'review'" class="review-section">
          <h2 class="review-heading">Resenha</h2>
          <div v-if="logData.review" class="review-body">
            <ReviewText :text="logData.review" />
          </div>
          <div v-else class="review-empty">
            <p class="review-empty-text">
              {{ isOwner ? 'Você não escreveu uma resenha para este livro.' : `${logData.user.display_name} não escreveu uma resenha para este livro.` }}
            </p>
          </div>
        </section>

        <ReadingBlocksSection
          v-else
          :log-id="logData.id"
          :initial-blocks="logData.blocks || []"
          :initial-progress="logData.progress"
          :is-owner="isOwner"
          :edition-page-count="logData.edition?.page_count"
          :is-finished="Boolean(logData.finished_on)"
        />
      </template>

      <nav class="entry-nav-links" aria-label="Navegação da leitura">
        <NuxtLink :to="`/@${logData.user.handle}`" class="footer-link">
          {{ isOwner ? 'Voltar para a sua biblioteca' : `Outras leituras de ${logData.user.display_name}` }}
        </NuxtLink>
        <NuxtLink :to="`/livro/${logData.work.slug}`" class="footer-link">
          Ver todas as edições de {{ logData.work.title }}
        </NuxtLink>
      </nav>
      </div>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getCookie, setResponseHeader } from 'h3'
import BookCover from '~/components/book/BookCover.vue'
import StarRating from '~/components/book/StarRating.vue'
import ReviewText from '~/components/log/ReviewText.vue'
import ReadingBlocksSection from '~/components/log/ReadingBlocksSection.vue'
import EmptyState from '~/components/ui/EmptyState.vue'
import ErrorState from '~/components/ui/ErrorState.vue'
import LoadingSkeleton from '~/components/ui/LoadingSkeleton.vue'
import {
  buildOgDescription,
  buildOgTitle,
  formatBookFormat,
  formatReadingDate,
  resolveEntryOgImageUrl,
} from '~/utils/entry'
import type { LogWithDetails } from '~~/shared/schemas/log'
import { isTimeoutOrAbort, TIMEOUT_MESSAGE } from '~/utils/fetch-error'
import { useFlash } from '~/composables/useFlash'

definePageMeta({
  middleware: 'home-layout',
})

const route = useRoute()
const id = computed(() => {
  const raw = route.params.id
  return Array.isArray(raw) ? (raw[0] ?? '') : (raw as string)
})

const requestFetch = useRequestFetch()
const reqUrl = typeof useRequestURL === 'function' ? useRequestURL() : null
const origin = computed(() => reqUrl?.origin || 'http://localhost:3000')

const event = import.meta.server && typeof useRequestEvent === 'function' ? useRequestEvent() : null

const session = typeof useState === 'function'
  ? useState<{ user?: { id?: string; handle?: string } | null }>('auth:session', () => ({ user: null }))
  : ref({ user: null })

const nuxtApp = typeof useNuxtApp === 'function' ? useNuxtApp() : null
const flash = useFlash()

const { data: log, pending, error, refresh } = useAsyncData<LogWithDetails>(
  `entry-${id.value}`,
  async () => {
    try {
      const result = await requestFetch<LogWithDetails>(`/api/logs/${id.value}` as string)
      if (event) {
        const hasSession = Boolean(getCookie(event, '__Secure-better-auth.session_token') || session.value?.user?.id)
        if (hasSession || result.visibility === 'privado') {
          setResponseHeader(event, 'Cache-Control', 'private, no-store')
        } else {
          setResponseHeader(event, 'Cache-Control', 'public, max-age=60, s-maxage=60')
        }
      }
      return result
    } catch (err: unknown) {
      if (event) {
        setResponseHeader(event, 'Cache-Control', 'private, no-store')
      }
      throw err
    }
  },
)

const logData = computed(() => log?.value ?? null)
const isPending = computed(() => Boolean(pending?.value))
const hasError = computed(() => Boolean(error?.value))
const is404 = computed(() => {
  const status = (error?.value as { statusCode?: number; status?: number })?.statusCode
    || (error?.value as { statusCode?: number; status?: number })?.status
  return status === 404 || (!logData.value && !isPending.value)
})

const sectionOrder = computed<Array<'review' | 'blocks'>>(() =>
  logData.value?.finished_on ? ['review', 'blocks'] : ['blocks', 'review'],
)

const isOwner = computed(() => {
  if (!logData.value || !session.value?.user) return false
  if (session.value.user.id && logData.value.user_id) {
    return session.value.user.id === logData.value.user_id
  }
  if (session.value.user.handle && logData.value.user?.handle) {
    return session.value.user.handle.toLowerCase() === logData.value.user.handle.toLowerCase()
  }
  return false
})

const publishedYear = computed(() => {
  if (!logData.value) return null
  return logData.value.work.first_published_year ?? logData.value.edition?.published_year ?? null
})

const authorsText = computed(() => {
  if (!logData.value?.work?.authors?.length) return ''
  return logData.value.work.authors.map((a) => a.name).join(', ')
})

const readingDateText = computed(() => {
  if (!logData.value) return ''
  if (!logData.value.finished_on) {
    const since = formatReadingDate(logData.value.started_on)
    return since ? `Lendo desde ${since}` : 'Lendo atualmente'
  }
  return formatReadingDate(logData.value.finished_on, logData.value.finished_precision)
})

const formatText = computed(() => {
  if (!logData.value?.format) return ''
  return formatBookFormat(logData.value.format)
})

const pageTitle = computed(() => {
  if (!logData.value) return 'Entrada não encontrada'
  return logData.value.work.title
})

const ogTitle = computed(() => {
  if (!logData.value) return 'Entrada - Meus Livros'
  return buildOgTitle(logData.value.work.title, logData.value.user.handle, logData.value.rating)
})

const ogDescription = computed(() => {
  if (!logData.value) return 'Registro de leitura no Meus Livros'
  return buildOgDescription(logData.value.review, logData.value.user.display_name, logData.value.work.title)
})

const canonicalUrl = computed(() => {
  return `${origin.value}/entrada/${id.value}`
})

const ogImage = computed(() => {
  if (!logData.value) return `${origin.value}/og-fallback.png`
  return resolveEntryOgImageUrl(logData.value, origin.value)
})

if (typeof useSeoMeta === 'function') {
  useSeoMeta({
    title: () => pageTitle.value,
    ogTitle: () => ogTitle.value,
    description: () => ogDescription.value,
    ogDescription: () => ogDescription.value,
    ogImage: () => ogImage.value,
    ogUrl: () => canonicalUrl.value,
    ogType: 'article',
    ogLocale: 'pt_BR',
    twitterCard: 'summary_large_image',
    twitterTitle: () => ogTitle.value,
    twitterDescription: () => ogDescription.value,
    twitterImage: () => ogImage.value,
  })
}

if (typeof useHead === 'function') {
  useHead({
    link: [
      {
        rel: 'canonical',
        href: () => canonicalUrl.value,
      },
    ],
  })
}

const copied = ref(false)

async function handleShare() {
  const url = canonicalUrl.value
  const shareData = {
    title: ogTitle.value,
    text: ogDescription.value,
    url,
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share(shareData)
      return
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        return
      }
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(url)
      copied.value = true
      setTimeout(() => {
        copied.value = false
      }, 2500)
    } catch {
    }
  }
}

const isDeleting = ref(false)
const deleteError = ref('')

const UNDO_SECONDS = 6
const pendingSeconds = ref(0)
const removeAnnouncement = ref('')
const undoBtnRef = ref<HTMLButtonElement | null>(null)
const removeBtnRef = ref<HTMLButtonElement | null>(null)
let undoTimer: ReturnType<typeof setInterval> | null = null

function clearUndoTimer(): void {
  if (undoTimer) {
    clearInterval(undoTimer)
    undoTimer = null
  }
}

function startDelete(): void {
  if (!logData.value || pendingSeconds.value > 0 || isDeleting.value) return
  deleteError.value = ''
  pendingSeconds.value = UNDO_SECONDS
  removeAnnouncement.value = `Esta leitura será removida em ${UNDO_SECONDS} segundos. Desfazer.`
  void nextTick(() => undoBtnRef.value?.focus())
  clearUndoTimer()
  undoTimer = setInterval(() => {
    pendingSeconds.value -= 1
    if (pendingSeconds.value <= 0) {
      clearUndoTimer()
      pendingSeconds.value = 0
      removeAnnouncement.value = 'Removendo a leitura...'
      void performDelete()
    }
  }, 1000)
}

function undoDelete(): void {
  clearUndoTimer()
  pendingSeconds.value = 0
  removeAnnouncement.value = 'Remoção cancelada.'
  void nextTick(() => removeBtnRef.value?.focus())
}

const DELETED_FLASH = 'Leitura removida.'
const LEAVE_FAILED_FLASH = 'Não foi possível remover a leitura. Tente de novo na página dela.'

// Na saída, `route.params.id` já é o da rota de destino (ou nenhum): o id
// vem do registro carregado, que não muda com a navegação.
function loadedLogId(): string {
  return logData.value?.id ?? id.value
}

function afterDeleteDestination(): string {
  return logData.value?.user?.handle ? `/@${logData.value.user.handle}` : '/'
}

function goTo(dest: string): Promise<unknown> {
  const run = () => navigateTo(dest)
  return Promise.resolve(nuxtApp ? nuxtApp.runWithContext(run) : run())
}

// Sair da página durante a contagem não cancela: o usuário pediu a remoção
// e, fora da página, já não tem como desfazer. A requisição sai na hora e o
// resultado aparece como aviso no layout, na página seguinte.
function deleteOnLeave(): void {
  if (pendingSeconds.value <= 0) return
  clearUndoTimer()
  pendingSeconds.value = 0
  const logId = loadedLogId()
  $fetch(`/api/logs/${logId}`, { method: 'DELETE', timeout: 15_000 })
    .then(() => flash.set(DELETED_FLASH))
    .catch(() => flash.set(LEAVE_FAILED_FLASH, 'error'))
}

// Fechar a aba ou sair do site: `$fetch` não sobrevive ao descarregamento,
// `keepalive` sim. A rota de DELETE não lê corpo.
let deletedOnPagehide = false

function onPageHide(): void {
  if (pendingSeconds.value <= 0) return
  clearUndoTimer()
  pendingSeconds.value = 0
  deletedOnPagehide = true
  void fetch(`/api/logs/${loadedLogId()}`, {
    method: 'DELETE',
    keepalive: true,
    credentials: 'same-origin',
  }).catch(() => {})
}

// Voltar pelo histórico restaura a página do bfcache com a entrada já
// removida; manda para a biblioteca em vez de mostrar dados apagados.
function onPageShow(e: PageTransitionEvent): void {
  if (!e.persisted || !deletedOnPagehide) return
  deletedOnPagehide = false
  void goTo(afterDeleteDestination()).then(() => flash.set(DELETED_FLASH))
}

onMounted(() => {
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('pageshow', onPageShow)
  startRequestedDelete()
})

// O "Remover esta leitura" do formulário de edição deixa o id desta leitura em
// `entry:remove-request` (estado de memória, nunca a URL) e navega para cá: a
// remoção começa com a mesma contagem e o mesmo "Desfazer". O pedido é
// consumido na leitura, então recarregar a página não o repete.
const removeRequest = useState<string | null>('entry:remove-request', () => null)

function startRequestedDelete(): void {
  const requestedId = removeRequest.value
  removeRequest.value = null
  if (!requestedId || requestedId !== id.value) return
  if (handleRemoveRequest()) return
  const stop = watch([logData, isPending, isOwner], () => {
    if (handleRemoveRequest()) stop()
  })
}

function handleRemoveRequest(): boolean {
  if (isPending.value) return false
  if (logData.value && isOwner.value) startDelete()
  return true
}

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('pageshow', onPageShow)
  }
  deleteOnLeave()
  clearUndoTimer()
})

async function performDelete(): Promise<void> {
  isDeleting.value = true
  deleteError.value = ''

  try {
    await $fetch(`/api/logs/${id.value}`, {
      method: 'DELETE',
      timeout: 15_000,
    })
    await goTo(afterDeleteDestination())
    flash.set(DELETED_FLASH)
  } catch (err: unknown) {
    if (isTimeoutOrAbort(err)) {
      deleteError.value = TIMEOUT_MESSAGE
      removeAnnouncement.value = TIMEOUT_MESSAGE
      return
    }
    const fetchErr = err as { data?: { message?: string } }
    deleteError.value = fetchErr.data?.message ?? 'Não foi possível remover o livro da biblioteca.'
    removeAnnouncement.value = deleteError.value
  } finally {
    isDeleting.value = false
  }
}
</script>

<style scoped>
.entry-page {
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  width: 100%;
  max-width: 72rem;
  margin: 0 auto;
  box-sizing: border-box;
}

.entry-status-wrap {
  width: 100%;
  max-width: 680px;
  padding: var(--space-8) 0;
  text-align: center;
}

.loading-text {
  color: var(--text-color);
  font-size: var(--font-size-base);
}

.entry-article {
  width: 100%;
  max-width: 680px;
  box-sizing: border-box;
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

.entry-main {
  min-width: 0;
}

.entry-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-6);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--input-bg);
}

.reader-link {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-1) var(--space-2);
  /* Alvo de toque maior que a linha de texto: o padding cresce a área e a
     margem negativa devolve o espaço, então o cabeçalho não muda de altura. */
  padding-block: 4px;
  margin-block: -4px;
  text-decoration: none;
  color: inherit;
  transition: opacity 0.2s;
}

@media (pointer: coarse) {
  .reader-link {
    padding-block: 14px;
    margin-block: -14px;
  }
}

.reader-link:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
}

.reader-link:hover {
  opacity: 0.9;
}

.reader-prefix {
  color: var(--text-color);
  font-size: var(--font-size-sm);
  white-space: nowrap;
}

.reader-name {
  color: #fff;
  font-size: var(--font-size-base);
  font-weight: 600;
}

.reader-handle {
  color: var(--text-bright);
  font-size: var(--font-size-sm);
}

.private-badge {
  display: inline-flex;
  align-items: center;
  background-color: var(--input-bg);
  color: var(--text-color);
  font-size: var(--font-size-xs);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
}

.book-card-section {
  display: flex;
  flex-direction: row;
  gap: var(--space-6);
  margin-bottom: var(--space-8);
}

@media (max-width: 540px) {
  .book-card-section {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
}

.cover-container {
  width: 140px;
  min-width: 140px;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--input-bg);
  background-color: #1e2328;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

.book-details {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.work-title {
  margin: 0 0 var(--space-2) 0;
  font-size: var(--font-size-2xl);
  line-height: var(--line-height-tight);
  color: #fff;
}

.title-link {
  color: #fff;
  text-decoration: none;
  transition: color 0.2s;
}

.title-link:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
}

.title-link:hover {
  color: var(--highlight);
}

.published-year {
  color: var(--text-color);
  font-size: var(--font-size-lg);
  font-weight: normal;
  margin-left: var(--space-2);
}

.work-authors {
  margin: 0 0 var(--space-3) 0;
  font-size: var(--font-size-base);
  color: var(--text-color);
}

.rating-box {
  margin-bottom: var(--space-3);
  font-size: var(--font-size-lg);
}

.metadata-pills {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: var(--space-6);
  font-size: var(--font-size-sm);
  color: var(--text-color);
}

@media (max-width: 540px) {
  .metadata-pills {
    justify-content: center;
  }
}

.meta-pill:not(:last-child)::after {
  content: "·";
  padding: 0 var(--space-2);
}

.publisher-pill {
  color: var(--text-bright);
}

.actions-row {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-2);
  width: 100%;
  max-width: 260px;
  margin-top: auto;
}

.actions-row .btn {
  width: 100%;
  font-size: var(--font-size-sm);
  min-height: 38px;
  padding: var(--space-2) var(--space-3);
  box-sizing: border-box;
}

.share-btn.is-copied {
  background-color: color-mix(in srgb, var(--success) 12%, transparent);
  border-color: var(--success);
  color: var(--success);
}

.btn-icon {
  flex-shrink: 0;
  vertical-align: middle;
}

.remove-zone {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
  max-width: 260px;
  margin-top: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background-color: rgba(220, 38, 38, 0.08);
  border: 1px solid rgba(220, 38, 38, 0.2);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  box-sizing: border-box;
}

@media (max-width: 540px) {
  .actions-row,
  .remove-zone {
    margin-inline: auto;
  }
}

.remove-msg {
  color: var(--text-bright);
}

.remove-error {
  color: var(--danger-text);
}

.review-section {
  padding-top: var(--space-6);
  border-top: 1px solid var(--input-bg);
  margin-bottom: var(--space-8);
}

.review-heading {
  font-size: var(--font-size-xl);
  color: #fff;
  margin: 0 0 var(--space-4) 0;
}

.review-body {
  font-size: var(--font-size-base);
  color: var(--text-bright);
  max-width: 640px;
}

.review-empty {
  padding: var(--space-4) 0;
}

.review-empty-text {
  color: var(--text-color);
  font-style: italic;
  font-size: var(--font-size-sm);
  margin: 0;
}

.entry-nav-links {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--input-bg);
}

.footer-link {
  display: inline-flex;
  align-items: center;
  min-height: var(--target-min-size);
  color: var(--text-color);
  text-decoration: underline;
  text-decoration-color: var(--input-bg);
  text-underline-offset: 0.25em;
  font-size: var(--font-size-sm);
}

.footer-link:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
}

.footer-link:hover {
  color: var(--text-bright);
  text-decoration-color: currentColor;
}

/* Fica depois das regras base de propósito: com a mesma especificidade,
   a ordem decide, e antes daqui `.book-card-section { flex-direction: row }`
   vencia e espremia título e metadados em 144px ao lado da capa. */
@media (min-width: 1024px) {
  .entry-article {
    max-width: none;
  }

  .entry-layout {
    display: grid;
    grid-template-columns: 280px minmax(0, 65ch);
    column-gap: var(--space-10, 3rem);
    align-items: start;
  }

  .book-card-section {
    position: sticky;
    top: var(--space-6);
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-4);
    margin-bottom: 0;
  }

  .cover-container {
    width: 200px;
    min-width: 200px;
  }

  .actions-row {
    margin-top: 0;
  }

  .metadata-pills {
    margin-bottom: var(--space-4);
  }

  /* A coluna da direita começa rente ao topo, qualquer que seja a primeira
     seção (resenha, progresso da leitura ou o resumo de páginas). */
  .entry-main > :first-child {
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }

  .remove-zone {
    justify-content: flex-start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .share-btn,
  .finish-btn,
  .reader-link,
  .title-link,
  .footer-link {
    transition: none;
  }
}
</style>
