<template>
  <div class="page-container">
    <div v-if="pending" class="loading-state">
      <LoadingSkeleton :count="6" />
    </div>

    <div v-else-if="error || !work" class="error-state">
      <EmptyState
        heading-tag="h1"
        title="Livro não encontrado."
        action-label="Ir para o início"
        action-href="/"
      />
    </div>

    <div v-else class="work-page">
      <article class="work-card">
        <header class="work-header">
          <div class="work-cover-wrapper">
            <BookCover
              :cover-url="work.cover_url"
              :title="work.title"
              :alt="authorsString ? `Capa de ${work.title}, de ${authorsString}` : `Capa de ${work.title}`"
              loading="eager"
            />
          </div>

          <div class="work-details">
            <h1 class="work-title">{{ work.title }}</h1>

            <div v-if="work.authors && work.authors.length > 0" class="work-authors">
              <span class="authors-by">por</span>
              <span
                v-for="(author, idx) in work.authors"
                :key="author.id"
                class="author-item"
              >
                <span class="author-name">{{ author.name }}</span>
                <span
                  v-if="formatAuthorCountry(author)"
                  class="author-country"
                > ({{ formatAuthorCountry(author) }})</span>
                <span v-if="idx < work.authors.length - 1" class="author-sep">, </span>
              </span>
            </div>

            <div
              v-if="work.average_rating !== null && work.average_rating > 0"
              class="work-rating-row"
            >
              <div class="work-rating-average">
                <StarRating :rating="work.average_rating" />
                <span class="rating-text">
                  {{ formatRating(work.average_rating) }} · {{ work.log_count }} {{ work.log_count === 1 ? 'leitura' : 'leituras' }}
                </span>
              </div>
              <RatingHistogram v-if="showHistogram" :ratings="logRatings" />
            </div>

            <div class="work-actions">
              <NuxtLink
                :to="primaryActionHref"
                class="work-primary-action"
              >
                {{ primaryActionLabel }}
              </NuxtLink>
            </div>

            <div v-if="work.series_name" class="work-series">
              <span class="meta-label">Série: </span>
              <span class="series-name">{{ work.series_name }}</span>
              <span v-if="work.series_number" class="series-number">, livro {{ work.series_number }}</span>
            </div>

            <dl class="work-meta-list">
              <div v-if="formattedYear" class="meta-item">
                <dt class="meta-dt">Primeira publicação: </dt>
                <dd class="meta-dd">{{ formattedYear }}</dd>
              </div>

              <div v-if="formattedLanguage" class="meta-item">
                <dt class="meta-dt">Idioma original: </dt>
                <dd class="meta-dd">{{ formattedLanguage }}</dd>
              </div>
            </dl>

            <div v-if="work.genres && work.genres.length > 0" class="work-genres">
              <span
                v-for="genre in work.genres"
                :key="genre.id"
                class="genre-chip"
              >{{ genre.label_pt }}</span>
            </div>
          </div>
        </header>

        <div class="work-main">
          <section v-if="userLogs.length > 0" class="user-logs-section">
            <h2 class="section-title">Suas leituras ({{ userLogs.length }})</h2>
            <ul class="user-logs-list">
              <li
                v-for="log in userLogs"
                :key="log.id"
                class="user-log-item"
              >
                <div class="user-log-meta">
                  <span class="user-log-date">
                    {{ log.finished_on ? formatReadingDate(log.finished_on, log.finished_precision) : 'Lendo agora' }}
                  </span>
                  <div v-if="log.rating !== null && log.rating > 0" class="user-log-stars">
                    <StarRating :rating="log.rating" />
                  </div>
                </div>
                <NuxtLink
                  :to="`/entrada/${log.id}`"
                  class="user-log-link"
                  :aria-label="log.finished_on ? `Ver leitura de ${formatReadingDate(log.finished_on, log.finished_precision)}` : 'Ver leitura em andamento'"
                >
                  Ver leitura
                </NuxtLink>
              </li>
            </ul>
          </section>

          <section class="logs-section">
            <h2 class="section-title">
              Registros de leitura
              <span v-if="work.log_count > 0" class="logs-count">({{ work.log_count }})</span>
            </h2>

            <div v-if="work.logs.length === 0" class="empty-logs">
              <EmptyState
                title="Ninguém registrou esse livro ainda."
                action-label="Registrar leitura"
                :action-href="`/app/novo?work_id=${work.id}`"
              />
            </div>

            <ul v-else class="logs-list">
              <li
                v-for="log in work.logs"
                :key="log.id"
                class="log-item"
              >
                <div class="log-header">
                  <NuxtLink :to="'/@' + log.user.handle" class="user-link">
                    @{{ log.user.handle }}
                  </NuxtLink>

                  <div v-if="log.rating !== null && log.rating > 0" class="log-rating">
                    <StarRating :rating="log.rating" />
                  </div>
                </div>

                <div v-if="log.review" class="log-review">
                  <ReviewText :text="getExcerpt(log.review)" />
                </div>

                <div class="log-footer">
                  <NuxtLink
                    :to="'/entrada/' + log.id"
                    class="entry-link"
                    :aria-label="`Ver leitura de @${log.user.handle}`"
                  >
                    Ver leitura
                  </NuxtLink>
                </div>
              </li>
            </ul>
          </section>

          <section v-if="hasEditionsToShow" class="editions-section">
            <h2 class="section-title">Edições cadastradas</h2>
            <ul class="editions-list">
              <li
                v-for="edition in work.editions"
                :key="edition.id"
                class="edition-item"
              >
                <span v-if="edition.publisher" class="edition-publisher">{{ edition.publisher }}</span>
                <span v-if="editionDetails(edition)" class="edition-details">{{ edition.publisher ? ', ' : '' }}{{ editionDetails(edition) }}</span>
              </li>
            </ul>
          </section>

          <div v-if="canDeleteWork" class="work-creator-actions">
            <button
              type="button"
              class="delete-work-btn"
              :disabled="isDeletingWork"
              @click="handleDeleteWork"
            >
              {{ isDeletingWork ? 'Excluindo livro...' : 'Excluir livro do catálogo' }}
            </button>
            <p v-if="deleteWorkError" class="delete-error-msg" role="alert">
              {{ deleteWorkError }}
            </p>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import BookCover from '~/components/book/BookCover.vue'
import RatingHistogram from '~/components/book/RatingHistogram.vue'
import StarRating from '~/components/book/StarRating.vue'
import ReviewText from '~/components/log/ReviewText.vue'
import EmptyState from '~/components/ui/EmptyState.vue'
import LoadingSkeleton from '~/components/ui/LoadingSkeleton.vue'
import { formatReadingDate } from '~/utils/entry'
import { isTimeoutOrAbort, TIMEOUT_MESSAGE } from '~/utils/fetch-error'
import type { WorkAuthorView, WorkEditionView, WorkWithDetails } from '~~/shared/schemas/work'
import { formatCountry, formatLanguage, formatPublicationYear } from '~~/shared/schemas/work'

definePageMeta({
  middleware: 'home-layout',
})

const route = useRoute()
const slug = computed(() => (route.params.slug as string) || '')

const requestFetch = useRequestFetch()
const requestUrl = useRequestURL()

const session = typeof useState === 'function'
  ? useState<{ user?: { id?: string } | null }>('auth:session', () => ({ user: null }))
  : ref({ user: null })

const nuxtApp = typeof useNuxtApp === 'function' ? useNuxtApp() : null

const { data: work, pending, error } = await useAsyncData<WorkWithDetails>(
  `work-${slug.value}`,
  () => requestFetch<WorkWithDetails>(`/api/works/${encodeURIComponent(slug.value)}`),
)

if (error.value) {
  throw createError({
    statusCode: error.value.statusCode || 404,
    statusMessage: 'Obra não encontrada',
    fatal: true,
  })
}

function formatAuthorCountry(author: WorkAuthorView): string | null {
  return formatCountry(author.country_code, author.country_label)
}

function formatRating(rating: number): string {
  return rating.toFixed(1).replace('.', ',')
}

function editionDetails(edition: WorkEditionView): string {
  const parts: string[] = []
  if (edition.published_year) parts.push(String(edition.published_year))
  if (edition.page_count) parts.push(`${edition.page_count} págs.`)
  if (edition.isbn13) parts.push(`ISBN ${edition.isbn13}`)
  if (edition.language) parts.push(edition.language.toUpperCase())
  return parts.join(', ')
}

function getExcerpt(text?: string | null): string {
  if (!text) return ''
  const trimmed = text.trim()
  if (trimmed.length <= 300) return trimmed
  return trimmed.slice(0, 300).trimEnd() + '…'
}

const formattedYear = computed(() => {
  return formatPublicationYear(work.value?.first_published_year)
})

const formattedLanguage = computed(() => {
  return formatLanguage(work.value?.original_language)
})

const hasEditionsToShow = computed(() => {
  if (!work.value?.editions || work.value.editions.length === 0) return false
  if (work.value.editions.length > 1) return true
  const single = work.value.editions[0]
  return Boolean(single && (single.publisher || single.isbn13 || single.page_count || single.published_year))
})

const authorsString = computed(() => {
  if (!work.value?.authors || work.value.authors.length === 0) return ''
  return work.value.authors.map((a) => a.name).join(', ')
})

const ogDescription = computed(() => {
  if (!work.value) return ''
  const parts: string[] = []
  if (authorsString.value) parts.push(authorsString.value)
  if (formattedYear.value) parts.push(formattedYear.value)
  const count = work.value.log_count
  const countStr = `${count} ${count === 1 ? 'leitura' : 'leituras'}`
  const meta = parts.length > 0 ? `${parts.join(' · ')}. ${countStr}.` : `${countStr}.`
  return `${work.value.title} - ${meta}`
})

const absoluteCoverUrl = computed(() => {
  const url = work.value?.cover_url
  if (!url) return undefined
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return `${requestUrl.origin}${url.startsWith('/') ? '' : '/'}${url}`
})

const pageUrl = computed(() => {
  if (!work.value?.slug) return requestUrl.href
  return `${requestUrl.origin}/livro/${work.value.slug}`
})

useSeoMeta({
  title: () => work.value?.title || 'Livro',
  ogTitle: () => work.value?.title ?? '',
  description: () => ogDescription.value,
  ogDescription: () => ogDescription.value,
  ogImage: () => absoluteCoverUrl.value,
  ogUrl: () => pageUrl.value,
  ogType: 'book',
})

useHead({
  meta: [
    {
      name: 'author',
      content: () => authorsString.value,
    },
  ],
})

const isMember = computed(() => Boolean(session.value?.user?.id))

const userLogs = computed(() => {
  if (!work.value || !session.value?.user?.id) return []
  const userId = session.value.user.id
  return work.value.logs
    .filter((l) => l.user.id === userId)
    .slice()
    .sort((a, b) => {
      const dateA = a.finished_on ? new Date(a.finished_on).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0)
      const dateB = b.finished_on ? new Date(b.finished_on).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0)
      const diff = dateB - dateA
      if (diff !== 0) return diff
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0
      return timeB - timeA
    })
})

const primaryActionHref = computed(() => {
  if (!work.value) return '#'
  if (isMember.value) {
    return `/app/novo?work_id=${work.value.id}`
  }
  return `/entrar?next=/livro/${work.value.slug}`
})

const primaryActionLabel = computed(() => {
  if (!isMember.value) {
    return 'Entrar para registrar'
  }
  return userLogs.value.length > 0 ? 'Registrar releitura' : 'Registrar leitura'
})

const logRatings = computed<number[]>(() => {
  if (!work.value?.logs) return []
  return work.value.logs
    .map((l) => l.rating)
    .filter((r): r is number => typeof r === 'number' && r > 0)
})

const showHistogram = computed(() => logRatings.value.length >= 3)

const canDeleteWork = computed(() => {
  if (!work.value || !session.value?.user?.id) return false
  return work.value.created_by === session.value.user.id && work.value.log_count === 0
})

const isDeletingWork = ref(false)
const deleteWorkError = ref('')

async function handleDeleteWork(): Promise<void> {
  if (!work.value) return
  if (!confirm('Tem certeza que deseja excluir este livro do catálogo? Esta ação removerá a obra e suas edições.')) {
    return
  }

  isDeletingWork.value = true
  deleteWorkError.value = ''

  try {
    await $fetch(`/api/works/${work.value.id}`, {
      method: 'DELETE',
      timeout: 15_000,
    })
    if (nuxtApp) {
      void nuxtApp.runWithContext(() => navigateTo('/'))
    } else {
      void navigateTo('/')
    }
  } catch (err: unknown) {
    if (isTimeoutOrAbort(err)) {
      deleteWorkError.value = TIMEOUT_MESSAGE
      return
    }
    const fetchErr = err as { data?: { message?: string } }
    deleteWorkError.value = fetchErr.data?.message ?? 'Não foi possível excluir o livro do catálogo.'
  } finally {
    isDeletingWork.value = false
  }
}
</script>

<style scoped>
.page-container {
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-4);
  box-sizing: border-box;
}

.loading-state,
.error-state {
  text-align: center;
  padding: var(--space-12) var(--space-4);
  color: var(--text-color);
}

/* The page is the surface: no wrapper card. Sections are split by rules. */
.work-card {
  padding: 0;
}

.work-header {
  display: flex;
  gap: var(--space-6);
  align-items: flex-start;
  margin-bottom: var(--space-8);
}

@media (max-width: 640px) {
  .work-header {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .work-rating-row {
    align-items: center;
  }
}

.work-cover-wrapper {
  width: 160px;
  min-width: 160px;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm);
  border: 1px solid var(--input-bg);
  box-sizing: border-box;
  overflow: hidden;
}

.work-details {
  flex: 1;
  min-width: 0;
}

.work-title {
  color: #fff;
  font-size: var(--font-size-2xl);
  line-height: var(--line-height-tight);
  margin: 0 0 var(--space-2) 0;
  word-break: break-word;
}

.work-authors {
  color: var(--text-color);
  font-size: var(--font-size-base);
  margin-bottom: var(--space-3);
}

.authors-by {
  margin-right: var(--space-1);
}

.author-name {
  color: #fff;
}

.author-country {
  color: var(--text-color);
}

.work-rating-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.work-rating-average {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

@media (max-width: 640px) {
  .work-rating-average {
    justify-content: center;
  }
}

.rating-text {
  color: var(--text-color);
  font-size: var(--font-size-sm);
  font-weight: 500;
}

.work-actions {
  margin-bottom: var(--space-4);
}

.work-primary-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background-color: var(--highlight);
  color: var(--bg-color);
  font-weight: 700;
  font-size: var(--font-size-sm);
  padding: 0 var(--space-4);
  min-height: var(--target-min-size, 44px);
  border-radius: var(--radius-sm);
  text-decoration: none;
  box-sizing: border-box;
  transition: opacity 0.2s, transform 0.1s;
}

.work-primary-action:hover {
  opacity: 0.9;
}

.work-primary-action:active {
  transform: translateY(1px);
}

.work-primary-action:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.work-series {
  color: var(--text-color);
  font-size: var(--font-size-sm);
  margin-bottom: var(--space-3);
}

.work-meta-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0 0 var(--space-4) 0;
  font-size: var(--font-size-sm);
}

.meta-item {
  display: flex;
  gap: var(--space-2);
}

@media (max-width: 640px) {
  .meta-item {
    justify-content: center;
  }
}

.meta-dt,
.meta-label {
  color: var(--text-color);
  font-weight: 500;
}

.meta-dd,
.series-name {
  color: #fff;
  margin: 0;
}

.series-number {
  color: var(--text-color);
}

.work-genres {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

@media (max-width: 640px) {
  .work-genres {
    justify-content: center;
  }
}

.genre-chip {
  display: inline-block;
  background-color: var(--input-bg);
  color: #fff;
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  padding: var(--space-1) var(--space-3);
  line-height: 1;
}

.section-title {
  color: #fff;
  font-size: var(--font-size-xl);
  margin: 0 0 var(--space-4) 0;
  border-bottom: 1px solid var(--input-bg);
  padding-bottom: var(--space-2);
}

.logs-count {
  color: var(--text-color);
  font-size: var(--font-size-base);
  font-weight: normal;
}

.user-logs-section {
  margin-bottom: var(--space-8);
}

.user-logs-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
}

.user-log-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: var(--space-1) 0;
}

.user-log-item + .user-log-item {
  border-top: 1px solid var(--input-bg);
}

.user-log-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.user-log-date {
  color: #fff;
  font-size: var(--font-size-sm);
  font-weight: 500;
}

.user-log-link {
  color: var(--highlight);
  text-decoration: none;
  font-size: var(--font-size-sm);
  font-weight: 500;
  min-height: var(--target-min-size, 44px);
  display: inline-flex;
  align-items: center;
}

.user-log-link:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
}

.user-log-link:hover {
  text-decoration: underline;
}

.editions-section {
  margin-bottom: var(--space-8);
}

.editions-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.edition-item {
  color: var(--text-color);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
}

.edition-publisher {
  color: #fff;
  font-weight: 500;
}

.logs-section {
  margin-bottom: var(--space-8);
}

.logs-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
}

.log-item {
  padding: var(--space-4) 0;
}

.log-item:first-child {
  padding-top: 0;
}

.log-item:last-child {
  padding-bottom: 0;
}

.log-item + .log-item {
  border-top: 1px solid var(--input-bg);
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-2);
}

.user-link {
  color: #fff;
  text-decoration: none;
  font-weight: 600;
  font-size: var(--font-size-sm);
}

.user-link:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
}

.user-link:hover {
  text-decoration: underline;
}

.log-review {
  margin: var(--space-2) 0 var(--space-3) 0;
}

.entry-link {
  color: var(--highlight);
  text-decoration: none;
  font-size: var(--font-size-sm);
  font-weight: 500;
}

.entry-link:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
}

.entry-link:hover {
  text-decoration: underline;
}

.work-creator-actions {
  margin-top: var(--space-6);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
}

.delete-work-btn {
  display: inline-flex;
  align-items: center;
  background: transparent;
  color: var(--text-color);
  border: 1px solid rgba(239, 68, 68, 0.3);
  font-family: inherit;
  font-size: var(--font-size-sm);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  min-height: 44px;
  box-sizing: border-box;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s, background-color 0.2s;
}

.delete-work-btn:hover:not(:disabled) {
  color: var(--danger-text);
  border-color: var(--danger);
  background-color: rgba(239, 68, 68, 0.08);
}

.delete-work-btn:focus-visible {
  outline: var(--focus-ring-width) solid var(--danger);
  outline-offset: var(--focus-ring-offset);
}

.delete-work-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.delete-error-msg {
  color: var(--danger-text);
  font-size: var(--font-size-sm);
  margin: 0;
}

@media (pointer: coarse) {
  .user-link,
  .entry-link {
    display: inline-flex;
    align-items: center;
    min-height: var(--target-min-size, 44px);
  }
}

@media (min-width: 1024px) {
  .page-container {
    max-width: 1100px;
  }

  .work-card {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
    gap: var(--space-8);
    align-items: start;
  }

  .work-header {
    position: sticky;
    top: var(--space-6);
    flex-direction: column;
    gap: var(--space-4);
    margin-bottom: 0;
  }

  .work-cover-wrapper {
    width: 100%;
    min-width: 0;
  }

  .work-details {
    width: 100%;
  }
}
</style>
