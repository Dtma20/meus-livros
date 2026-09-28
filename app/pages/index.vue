<template>
  <div class="home-page">
    <LandingView v-if="!isAuthenticated" />

    <div v-else class="dashboard-container">
      <header class="dashboard-header">
        <div class="dashboard-header-text">
          <h1 class="dashboard-title">Minha Leitura</h1>
          <p class="dashboard-subtitle">Acompanhe seu progresso e as atividades do grupo</p>
        </div>
        <div class="dashboard-header-actions">
          <NuxtLink to="/app/novo" class="btn-primary btn-register">
            + Cadastrar livro
          </NuxtLink>
        </div>
      </header>

      <div v-if="pending" class="dashboard-loading">
        <LoadingSkeleton :count="4" />
      </div>

      <ErrorState
        v-else-if="hasFeedError"
        title="Algo deu errado. Tente de novo."
        message="Não foi possível carregar suas leituras."
        action-label="Tentar de novo"
        @retry="refresh"
      />

      <div v-else class="dashboard-content">
        <section class="dashboard-section in-progress-section">
          <div class="section-header">
            <div>
              <h2 class="section-title">Lendo atualmente</h2>
              <p class="section-subtitle">
                {{ inProgressBooks.length }} {{ inProgressBooks.length === 1 ? 'leitura em andamento' : 'leituras em andamento' }}
              </p>
            </div>
          </div>

          <div v-if="inProgressBooks.length === 0" class="empty-in-progress">
            <p class="empty-in-progress-text">Você não tem nenhuma leitura em andamento no momento.</p>
            <NuxtLink to="/app/novo" class="btn-secondary-link">
              Começar a ler um livro →
            </NuxtLink>
          </div>

          <div v-else class="in-progress-grid">
            <article
              v-for="book in inProgressBooks"
              :key="book.id"
              class="in-progress-card"
            >
              <div class="in-progress-cover-col">
                <NuxtLink
                  :to="`/entrada/${book.id}`"
                  class="in-progress-cover-link"
                  tabindex="-1"
                  aria-hidden="true"
                >
                  <BookCover
                    :alt="`Capa de ${book.work.title}`"
                    :title="book.work.title"
                    :cover-url="book.work.cover_url"
                    :isbn13="book.work.isbn13"
                    :ol-cover-id="book.work.ol_cover_id"
                    loading="lazy"
                  />
                </NuxtLink>
              </div>

              <div class="in-progress-info-col">
                <div class="in-progress-meta">
                  <NuxtLink :to="`/entrada/${book.id}`" class="in-progress-title">
                    {{ book.work.title }}
                  </NuxtLink>
                  <p v-if="formatAuthors(book.work.authors)" class="in-progress-author">
                    {{ formatAuthors(book.work.authors) }}
                  </p>
                </div>

                <div class="in-progress-stats">
                  <div class="progress-bar-wrap" role="progressbar" :aria-valuenow="book.percentage ?? (book.total_pages ? Math.min(100, Math.round((book.pages_read / book.total_pages) * 100)) : 0)" aria-valuemin="0" aria-valuemax="100">
                    <div
                      class="progress-bar-fill"
                      :style="{ width: `${book.percentage ?? (book.total_pages ? Math.min(100, Math.round((book.pages_read / book.total_pages) * 100)) : 0)}%` }"
                    />
                  </div>
                  <div class="progress-details">
                    <span v-if="book.percentage !== null" class="progress-percent">
                      {{ book.percentage }}% concluído
                    </span>
                    <span class="progress-pages">
                      <template v-if="book.total_pages">
                        {{ book.pages_read }} de {{ book.total_pages }} páginas lidas
                      </template>
                      <template v-else-if="book.pages_read > 0">
                        {{ book.pages_read }} páginas lidas
                      </template>
                      <template v-else>
                        Nenhum bloco registrado ainda
                      </template>
                    </span>
                  </div>
                </div>

                <div class="in-progress-actions">
                  <NuxtLink :to="`/entrada/${book.id}`" class="btn-continue-reading">
                    Continuar lendo →
                  </NuxtLink>
                </div>
              </div>
            </article>
          </div>
        </section>

        <ShelfSection :books="shelfBooks" />

        <ReadingCarousel
          v-if="completedBooks.length > 0"
          :books="completedBooks"
        />

        <section class="dashboard-section feed-section">
          <div class="section-header">
            <div>
              <h2 class="section-title">Atividade recente do grupo</h2>
              <p class="section-subtitle">Últimas leituras registradas pelos membros</p>
            </div>
          </div>

          <EmptyState
            v-if="entries.length === 0"
            title="Ninguém registrou nada ainda. Seja o primeiro."
            action-label="Registrar livro"
            action-href="/app/novo"
          />

          <div v-else class="feed-list">
            <article
              v-for="(entry, i) in entries"
              :key="entry.id"
              class="feed-row"
            >
              <div class="feed-cover-col">
                <NuxtLink
                  :to="`/entrada/${entry.id}`"
                  class="feed-cover-link"
                  tabindex="-1"
                  aria-hidden="true"
                >
                  <BookCover
                    :alt="formatAuthors(entry.work.authors) ? `Capa de ${entry.work.title}, de ${formatAuthors(entry.work.authors)}` : `Capa de ${entry.work.title}`"
                    :title="entry.work.title"
                    :cover-url="entry.edition?.cover_url || entry.work.cover_url"
                    :ol-cover-id="entry.edition?.ol_cover_id"
                    :isbn13="entry.edition?.isbn13"
                    :loading="i < 2 ? 'eager' : 'lazy'"
                  />
                </NuxtLink>
              </div>

              <div class="feed-body-col">
                <div class="feed-row-header">
                  <NuxtLink :to="`/entrada/${entry.id}`" class="feed-work-title">
                    {{ entry.work.title }}
                  </NuxtLink>
                  <span class="feed-relative-date" :title="formatFullDate(entry.created_at)">
                    {{ formatRelativeDate(entry.created_at) }}
                  </span>
                </div>

                <div class="feed-meta">
                  <span class="feed-reader">
                    por
                    <NuxtLink :to="`/@${entry.user.handle}`" class="feed-user-link">
                      @{{ entry.user.handle }}
                    </NuxtLink>
                  </span>
                  <div v-if="entry.rating" class="feed-rating">
                    <StarRating :rating="entry.rating" />
                  </div>
                </div>

                <p v-if="entry.review_excerpt" class="feed-review-excerpt">
                  {{ entry.review_excerpt }}
                </p>
              </div>
            </article>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import LandingView from '~/components/landing/LandingView.vue'
import BookCover from '~/components/book/BookCover.vue'
import StarRating from '~/components/book/StarRating.vue'
import ReadingCarousel from '~/components/dashboard/ReadingCarousel.vue'
import ShelfSection from '~/components/dashboard/ShelfSection.vue'
import EmptyState from '~/components/ui/EmptyState.vue'
import ErrorState from '~/components/ui/ErrorState.vue'
import LoadingSkeleton from '~/components/ui/LoadingSkeleton.vue'
import { formatFullDate, formatRelativeDate } from '~/utils/date'
import type { AuthSessionState } from '~/middleware/auth'
import type { FeedEntry, FeedResponse } from '~~/shared/schemas/feed'
import type {
  DashboardCompletedBook,
  DashboardInProgressBook,
  DashboardResponse,
  DashboardShelfBook,
} from '~~/shared/schemas/dashboard'

interface HomeAsyncData {
  authenticated: boolean
  inProgress: DashboardInProgressBook[]
  completed: DashboardCompletedBook[]
  shelf: DashboardShelfBook[]
  entries: FeedEntry[]
  hasFeedError: boolean
  redirectTo?: string
}

definePageMeta({
  middleware: 'home-layout',
})

const requestFetch = useRequestFetch()
const reqUrl = typeof useRequestURL === 'function' ? useRequestURL() : null
const origin = computed(() => reqUrl?.origin || 'http://localhost:3000')
const nuxtApp = typeof useNuxtApp === 'function' ? useNuxtApp() : null

const session = useState<AuthSessionState>('auth:session', () => ({
  user: null,
  fetched: false,
}))

const { data: pageData, pending, refresh } = await useAsyncData<HomeAsyncData>('home-dashboard', async () => {
  const current = session.value

  if (!current?.user) {
    return {
      authenticated: false,
      inProgress: [],
      completed: [],
      shelf: [],
      entries: [],
      hasFeedError: false,
    }
  }

  const hasProfile = Boolean(current.hasProfile || current.user.hasProfile || current.user.handle)

  if (!hasProfile) {
    return {
      authenticated: false,
      inProgress: [],
      completed: [],
      shelf: [],
      entries: [],
      hasFeedError: false,
      redirectTo: '/app/bem-vindo',
    }
  }

  try {
    const [dashboard, feed] = await Promise.all([
      requestFetch<DashboardResponse>('/api/dashboard').catch(() => ({ inProgress: [], completed: [], shelf: [] })),
      requestFetch<FeedResponse>('/api/feed/recentes').catch(() => ({ entries: [] })),
    ])

    return {
      authenticated: true,
      inProgress: dashboard?.inProgress ?? [],
      completed: dashboard?.completed ?? [],
      shelf: dashboard?.shelf ?? [],
      entries: feed?.entries ?? [],
      hasFeedError: false,
    }
  }
  catch {
    return {
      authenticated: true,
      inProgress: [],
      completed: [],
      shelf: [],
      entries: [],
      hasFeedError: true,
    }
  }
})

if (pageData.value?.redirectTo) {
  if (nuxtApp) {
    await nuxtApp.runWithContext(() => navigateTo(pageData.value!.redirectTo))
  } else {
    await navigateTo(pageData.value.redirectTo)
  }
}

const isAuthenticated = computed(() => Boolean(pageData.value?.authenticated))
const inProgressBooks = computed(() => pageData.value?.inProgress ?? [])
const completedBooks = computed(() => pageData.value?.completed ?? [])
const shelfBooks = computed(() => pageData.value?.shelf ?? [])
const entries = computed(() => pageData.value?.entries ?? [])
const hasFeedError = computed(() => Boolean(pageData.value?.hasFeedError))

function formatAuthors(authors?: { name: string }[]): string {
  if (!authors || authors.length === 0) return ''
  return authors.map((a) => a.name).join(', ')
}

useSeoMeta({
  title: 'Meus Livros',
  ogTitle: 'Meus Livros',
  description: 'Uma pequena biblioteca compartilhada de leituras entre amigos.',
  ogDescription: 'Uma pequena biblioteca compartilhada de leituras entre amigos.',
  ogType: 'website',
  ogLocale: 'pt_BR',
  ogUrl: () => reqUrl?.href ?? origin.value,
  ogImage: () => `${origin.value}/og-fallback.png`,
  twitterCard: 'summary_large_image',
  twitterTitle: 'Meus Livros',
  twitterDescription: 'Uma pequena biblioteca compartilhada de leituras entre amigos.',
  twitterImage: () => `${origin.value}/og-fallback.png`,
})

useHead({
  link: [
    {
      rel: 'canonical',
      href: () => reqUrl?.href ?? origin.value,
    },
  ],
})
</script>

<style scoped>
.home-page {
  width: 100%;
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background-color: var(--highlight);
  color: #000;
  font-weight: 700;
  font-size: var(--font-size-sm);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-sm);
  text-decoration: none;
  border: none;
  cursor: pointer;
  transition: opacity 0.2s;
  white-space: nowrap;
  min-height: 44px;
  box-sizing: border-box;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-primary:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.btn-register {
  padding: var(--space-2) var(--space-4);
  font-size: var(--font-size-sm);
}

.btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background-color: var(--card-bg);
  border: 1px solid var(--input-bg);
  color: var(--text-color);
  font-weight: 600;
  font-size: var(--font-size-sm);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-sm);
  text-decoration: none;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s, background-color 0.2s;
  white-space: nowrap;
  min-height: 44px;
  box-sizing: border-box;
}

.btn-secondary:hover {
  color: #fff;
  border-color: var(--highlight);
  background-color: var(--input-bg);
}

.btn-secondary:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.dashboard-container {
  width: 100%;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--input-bg);
  flex-wrap: wrap;
}

.dashboard-header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.dashboard-title {
  font-family: var(--font-serif);
  font-size: var(--font-size-2xl);
  font-weight: 600;
  letter-spacing: -0.015em;
  color: #fff;
  margin: 0 0 var(--space-1) 0;
  line-height: var(--line-height-tight);
}

.dashboard-subtitle {
  font-size: var(--font-size-sm);
  color: var(--text-color);
  margin: 0;
}

.dashboard-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.dashboard-section {
  display: flex;
  flex-direction: column;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: var(--space-4);
}

.section-title {
  font-family: var(--font-serif);
  font-size: var(--font-size-xl);
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #fff;
  margin: 0;
}

.section-subtitle {
  font-size: var(--font-size-sm);
  color: var(--text-color);
  margin: var(--space-1) 0 0;
}

.in-progress-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: var(--space-4);
}

.in-progress-card {
  display: flex;
  gap: var(--space-4);
  background-color: var(--card-bg);
  border: 1px solid var(--input-bg);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  transition: border-color 0.2s;
}

.in-progress-card:hover {
  border-color: var(--highlight);
}

.in-progress-cover-col {
  width: 75px;
  min-width: 75px;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--input-bg);
  background-color: #1e2328;
  flex-shrink: 0;
}

.in-progress-cover-link {
  display: block;
  width: 100%;
  height: 100%;
}

.in-progress-info-col {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  flex: 1;
  min-width: 0;
}

.in-progress-meta {
  margin-bottom: var(--space-2);
}

.in-progress-title {
  font-family: var(--font-serif);
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #fff;
  text-decoration: none;
  line-height: var(--line-height-tight);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.in-progress-title:hover {
  color: var(--highlight);
}

.in-progress-author {
  font-size: var(--font-size-xs);
  color: var(--text-color);
  margin: var(--space-1) 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.in-progress-stats {
  margin: var(--space-2) 0;
}

.progress-bar-wrap {
  width: 100%;
  height: 6px;
  background-color: var(--input-bg);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background-color: var(--highlight);
  border-radius: var(--radius-full);
  transition: width 0.3s ease;
}

.progress-details {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: var(--space-1);
  font-size: var(--font-size-xs);
}

.progress-percent {
  font-weight: 700;
  color: var(--highlight);
}

.progress-pages {
  color: var(--text-color);
  opacity: 0.85;
}

.in-progress-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.btn-continue-reading {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--highlight);
  text-decoration: none;
  transition: opacity 0.15s;
}

.btn-continue-reading:hover {
  text-decoration: underline;
  opacity: 0.9;
}

.empty-in-progress {
  padding: var(--space-6) var(--space-4);
  background-color: var(--card-bg);
  border: 1px dashed var(--input-bg);
  border-radius: var(--radius-md);
  text-align: center;
}

.empty-in-progress-text {
  font-size: var(--font-size-sm);
  color: var(--text-color);
  margin: 0 0 var(--space-3) 0;
}

.btn-secondary-link {
  display: inline-block;
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--highlight);
  text-decoration: none;
}

.btn-secondary-link:hover {
  text-decoration: underline;
}

.feed-section {
  margin-top: var(--space-2);
}

.feed-error-state {
  text-align: center;
  padding: var(--space-8) var(--space-4);
  background-color: var(--card-bg);
  border: 1px solid var(--danger);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-6);
}

.feed-error-title {
  font-size: var(--font-size-base);
  font-weight: 700;
  color: var(--danger);
  margin: 0 0 var(--space-2) 0;
}

.feed-error-subtitle {
  font-size: var(--font-size-sm);
  color: var(--text-color);
  margin: 0;
}

.feed-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.feed-row {
  display: flex;
  gap: var(--space-4);
  background-color: var(--card-bg);
  border: 1px solid var(--input-bg);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  transition: border-color 0.2s;
}

.feed-row:hover {
  border-color: var(--highlight);
}

.feed-cover-col {
  width: 70px;
  min-width: 70px;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--input-bg);
  background-color: #1e2328;
  flex-shrink: 0;
}

.feed-cover-link {
  display: block;
  width: 100%;
  height: 100%;
}

.feed-body-col {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.feed-row-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}

.feed-work-title {
  font-family: var(--font-serif);
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #fff;
  text-decoration: none;
  line-height: var(--line-height-tight);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feed-work-title:hover {
  color: var(--highlight);
}

.feed-relative-date {
  font-size: var(--font-size-xs);
  color: var(--text-color);
  white-space: nowrap;
  flex-shrink: 0;
}

.feed-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
}

.feed-reader {
  font-size: var(--font-size-xs);
  color: var(--text-color);
}

.feed-user-link {
  color: var(--highlight);
  text-decoration: none;
  font-weight: 600;
}

.feed-work-title:focus-visible,
.feed-user-link:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
}

.feed-user-link:hover {
  text-decoration: underline;
}

.feed-review-excerpt {
  font-size: var(--font-size-sm);
  color: #c9d1d9;
  line-height: var(--line-height-relaxed);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

@media (max-width: 600px) {
  .landing-card {
    padding: var(--space-6) var(--space-4);
  }

  .dashboard-header,
  .feed-header {
    margin-bottom: var(--space-4);
    padding-bottom: var(--space-3);
  }

  .dashboard-title,
  .feed-title {
    font-size: var(--font-size-xl);
  }

  .in-progress-grid {
    grid-template-columns: 1fr;
  }

  .in-progress-card {
    padding: var(--space-3);
    gap: var(--space-3);
  }

  .in-progress-cover-col {
    width: 60px;
    min-width: 60px;
  }

  .feed-row {
    padding: var(--space-3);
    gap: var(--space-3);
  }

  .feed-cover-col {
    width: 60px;
    min-width: 60px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .btn-primary,
  .feed-row {
    transition: none;
  }
}
</style>
