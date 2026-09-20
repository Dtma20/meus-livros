<template>
  <div class="entry-page">
    <!-- Loading state -->
    <div v-if="isPending" class="entry-status-wrap" role="status">
      <LoadingSkeleton :count="1" />
    </div>

    <!-- Error / Not found state -->
    <div v-else-if="hasError || !logData" class="entry-status-wrap" role="status">
      <EmptyState
        v-if="is404"
        heading-tag="h1"
        title="Entrada não encontrada"
        message="Esta entrada não existe, foi removida ou é privada."
        action-label="Voltar para o início"
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

    <!-- Main Content -->
    <article v-else class="entry-article">
      <!-- Header: Library owner context -->
      <header class="entry-header">
        <NuxtLink :to="`/@${logData.user.handle}`" class="reader-link">
          <span class="reader-prefix">Biblioteca de</span>
          <strong class="reader-name">{{ logData.user.display_name }}</strong>
          <span class="reader-handle">@{{ logData.user.handle }}</span>
        </NuxtLink>

        <span
          v-if="logData.visibility === 'privado'"
          class="private-badge"
          title="Esta entrada é visível apenas para você"
        >
          🔒 Registro privado
        </span>
      </header>

      <!-- Book Card & Information -->
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
              📅 {{ readingDateText }}
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

          <!-- Affordances: Share & Edit -->
          <div class="actions-row">
            <button
              type="button"
              class="share-btn"
              :class="{ 'is-copied': copied }"
              :aria-label="copied ? 'Link copiado para a área de transferência' : 'Compartilhar esta entrada'"
              @click="handleShare"
            >
              <span class="share-icon" aria-hidden="true">{{ copied ? '✓' : '🔗' }}</span>
              <span>{{ copied ? 'Link copiado!' : 'Compartilhar' }}</span>
            </button>

            <NuxtLink
              v-if="isOwner"
              :to="`/app/entrada/${logData.id}/editar`"
              class="edit-btn"
            >
              ✏️ Editar
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- Review Section -->
      <section class="review-section">
        <h2 class="review-heading">Resenha</h2>
        <div v-if="logData.review" class="review-body">
          <ReviewText :text="logData.review" />
        </div>
        <div v-else class="review-empty">
          <p class="review-empty-text">
            {{ logData.user.display_name }} não escreveu uma resenha para este livro.
          </p>
        </div>
      </section>

      <!-- Footer Navigation -->
      <footer class="entry-footer">
        <NuxtLink :to="`/@${logData.user.handle}`" class="footer-link">
          ← Outras leituras de {{ logData.user.display_name }}
        </NuxtLink>
        <NuxtLink :to="`/livro/${logData.work.slug}`" class="footer-link">
          Ver todas as edições de {{ logData.work.title }} →
        </NuxtLink>
      </footer>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import BookCover from '~/components/book/BookCover.vue'
import StarRating from '~/components/book/StarRating.vue'
import ReviewText from '~/components/log/ReviewText.vue'
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

const route = useRoute()
const id = computed(() => {
  const raw = route.params.id
  return Array.isArray(raw) ? (raw[0] ?? '') : (raw as string)
})

const requestFetch = useRequestFetch()
const reqUrl = typeof useRequestURL === 'function' ? useRequestURL() : null
const origin = computed(() => reqUrl?.origin || 'http://localhost:3000')

const { data: log, pending, error, refresh } = useAsyncData<LogWithDetails>(
  `entry-${id.value}`,
  async () => {
    try {
      const result = await requestFetch<LogWithDetails>(`/api/logs/${id.value}` as string)
      if (import.meta.server) {
        const event = typeof useRequestEvent === 'function' ? useRequestEvent() : null
        if (event) {
          const cookieToken = typeof useCookie === 'function'
            ? useCookie('better-auth.session_token').value
            : null
          const hasSession = Boolean(cookieToken)
          if (hasSession || result.visibility === 'privado') {
            setResponseHeader(event, 'Cache-Control', 'private, no-store')
          } else {
            setResponseHeader(event, 'Cache-Control', 'public, max-age=60, s-maxage=60')
          }
        }
      }
      return result
    } catch (err: unknown) {
      if (import.meta.server) {
        const event = typeof useRequestEvent === 'function' ? useRequestEvent() : null
        if (event) {
          const status = (err as { statusCode?: number; status?: number })?.statusCode
            || (err as { statusCode?: number; status?: number })?.status
            || 404
          setResponseStatus(event, status)
          setResponseHeader(event, 'Cache-Control', 'private, no-store')
        }
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

// Check if viewer owns this log
const session = typeof useState === 'function'
  ? useState<{ user?: { id?: string } | null }>('auth:session', () => ({ user: null }))
  : ref({ user: null })

const isOwner = computed(() => {
  if (!logData.value || !session.value?.user?.id) return false
  return logData.value.user_id === session.value.user.id
})

// Metadata values
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
  return formatReadingDate(logData.value.finished_on, logData.value.finished_precision)
})

const formatText = computed(() => {
  if (!logData.value?.format) return ''
  return formatBookFormat(logData.value.format)
})

// Open Graph & Head tags
const ogTitle = computed(() => {
  if (!logData.value) return 'Entrada — Meus Livros'
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
    title: () => ogTitle.value,
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

// Share affordance
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
      // Ignore clipboard error
    }
  }
}
</script>

<style scoped>
.entry-page {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: var(--space-6) var(--space-4);
  width: 100%;
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
  background-color: var(--card-bg);
  border-radius: var(--radius-md);
  border: 1px solid var(--input-bg);
  padding: var(--space-8);
  box-sizing: border-box;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
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
  align-items: baseline;
  gap: var(--space-2);
  text-decoration: none;
  color: inherit;
  transition: opacity 0.2s;
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
}

.reader-name {
  color: #fff;
  font-size: var(--font-size-base);
  font-weight: 600;
}

.reader-handle {
  color: var(--highlight);
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
  gap: var(--space-2);
  margin-bottom: var(--space-6);
}

@media (max-width: 540px) {
  .metadata-pills {
    justify-content: center;
  }
}

.meta-pill {
  display: inline-flex;
  align-items: center;
  background-color: var(--input-bg);
  color: var(--text-color);
  font-size: var(--font-size-xs);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
}

.publisher-pill {
  color: #c9d1d9;
}

.actions-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: auto;
}

@media (max-width: 540px) {
  .actions-row {
    justify-content: center;
  }
}

.share-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  background-color: var(--input-bg);
  color: #fff;
  border: 1px solid var(--text-color);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-4);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  min-height: 44px;
  box-sizing: border-box;
  transition: background-color 0.2s, border-color 0.2s, color 0.2s;
}

.share-btn:hover {
  border-color: var(--highlight);
  color: var(--highlight);
}

.share-btn:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.share-btn.is-copied {
  background-color: #1a3826;
  border-color: #3fb950;
  color: #3fb950;
}

.share-icon {
  font-size: 1rem;
}

.edit-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--text-color);
  text-decoration: none;
  font-size: var(--font-size-sm);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  min-height: 44px;
  box-sizing: border-box;
  transition: color 0.2s;
}

.edit-btn:hover {
  color: #fff;
}

.edit-btn:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
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
  color: #d0d7de;
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

.entry-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--input-bg);
}

.footer-link {
  color: var(--highlight);
  text-decoration: none;
  font-size: var(--font-size-sm);
  transition: opacity 0.2s;
}

.footer-link:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
}

.footer-link:hover {
  text-decoration: underline;
}

@media (prefers-reduced-motion: reduce) {
  .share-btn,
  .edit-btn,
  .reader-link,
  .title-link,
  .footer-link {
    transition: none;
  }
}
</style>
