<template>
  <div class="page-container">
    <div v-if="pending" class="loading-state">
      <p>Carregando livro…</p>
    </div>

    <div v-else-if="error || !work" class="error-state">
      <p class="error-text">Livro não encontrado.</p>
      <NuxtLink to="/" class="back-link">← Voltar para o início</NuxtLink>
    </div>

    <div v-else class="work-page">
      <article class="work-card">
        <header class="work-header">
          <div class="work-cover-wrapper">
            <BookCover
              :cover-url="work.cover_url"
              :title="work.title"
              :alt="`Capa do livro ${work.title}`"
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
              <StarRating :rating="work.average_rating" />
              <span class="rating-text">
                {{ formatRating(work.average_rating) }} · {{ work.log_count }} {{ work.log_count === 1 ? 'leitura' : 'leituras' }}
              </span>
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

        <section v-if="hasEditionsToShow" class="editions-section">
          <h2 class="section-title">Edições cadastradas</h2>
          <ul class="editions-list">
            <li
              v-for="edition in work.editions"
              :key="edition.id"
              class="edition-item"
            >
              <span v-if="edition.publisher" class="edition-publisher">{{ edition.publisher }}</span>
              <span v-if="edition.published_year" class="edition-year">({{ edition.published_year }})</span>
              <span v-if="edition.page_count" class="edition-pages">· {{ edition.page_count }} págs.</span>
              <span v-if="edition.isbn13" class="edition-isbn">· ISBN {{ edition.isbn13 }}</span>
              <span v-if="edition.language" class="edition-lang">· {{ edition.language.toUpperCase() }}</span>
            </li>
          </ul>
        </section>

        <section class="logs-section">
          <h2 class="section-title">
            Registros de leitura
            <span v-if="work.log_count > 0" class="logs-count">({{ work.log_count }})</span>
          </h2>

          <div v-if="work.logs.length === 0" class="empty-logs">
            <EmptyState message="Ninguém registrou esse livro ainda." />
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
                <NuxtLink :to="'/entrada/' + log.id" class="entry-link">
                  Ver registro completo →
                </NuxtLink>
              </div>
            </li>
          </ul>
        </section>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import BookCover from '~/components/book/BookCover.vue'
import StarRating from '~/components/book/StarRating.vue'
import ReviewText from '~/components/log/ReviewText.vue'
import EmptyState from '~/components/ui/EmptyState.vue'
import type { WorkAuthorView, WorkWithDetails } from '~~/shared/schemas/work'
import { formatCountry, formatLanguage, formatPublicationYear } from '~~/shared/schemas/work'

const route = useRoute()
const slug = computed(() => (route.params.slug as string) || '')

const requestFetch = useRequestFetch()
const requestUrl = useRequestURL()

// Awaited on purpose. This page exists to be server-rendered: the crawler that
// builds the WhatsApp preview reads the first response and runs no JavaScript,
// and a missing work has to answer 404 rather than 200 with an error box. Without
// the await, `error.value` is still null when the check below runs, the throw
// never fires, and every unknown slug returns 200.
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
  return `${work.value.title} — ${meta}`
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
  title: () => (work.value ? `${work.value.title} — Meus Livros` : 'Livro — Meus Livros'),
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

.error-text {
  color: var(--danger);
  font-size: var(--font-size-lg);
  margin-bottom: var(--space-4);
}

.back-link {
  color: var(--highlight);
  text-decoration: none;
  font-weight: 500;
}

.back-link:hover {
  text-decoration: underline;
}

.work-card {
  background-color: var(--card-bg);
  border-radius: var(--radius-md);
  padding: var(--space-6);
  border: 1px solid var(--input-bg);
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
}

.work-cover-wrapper {
  width: 160px;
  min-width: 160px;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm);
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
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
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.rating-text {
  color: var(--text-color);
  font-size: var(--font-size-sm);
  font-weight: 500;
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

.genre-chip {
  display: inline-block;
  background-color: var(--input-bg);
  color: #fff;
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  padding: 4px 10px;
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
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.edition-publisher {
  color: #fff;
  font-weight: 500;
}

.logs-section {
  margin-top: var(--space-6);
}

.logs-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.log-item {
  background-color: var(--bg-color);
  border: 1px solid var(--input-bg);
  border-radius: var(--radius-sm);
  padding: var(--space-4);
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-2);
}

.user-link {
  color: var(--highlight);
  text-decoration: none;
  font-weight: 600;
  font-size: var(--font-size-sm);
}

.user-link:hover {
  text-decoration: underline;
}

.log-review {
  margin: var(--space-2) 0 var(--space-3) 0;
}

.log-footer {
  text-align: right;
}

.entry-link {
  color: var(--highlight);
  text-decoration: none;
  font-size: var(--font-size-xs);
  font-weight: 500;
}

.entry-link:hover {
  text-decoration: underline;
}
</style>
