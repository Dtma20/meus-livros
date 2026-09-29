<template>
  <div class="home-page">
    <LandingView v-if="!isAuthenticated" />

    <div v-else class="dashboard-container">
      <h1 class="sr-only">Início</h1>

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
        <section v-if="inProgressBooks.length > 0" class="dashboard-section in-progress-section">
          <h2 class="section-title">Lendo agora</h2>

          <div class="in-progress-grid">
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

                <div v-if="book.pages_read > 0" class="in-progress-stats">
                  <div
                    v-if="book.total_pages"
                    class="progress-bar-wrap"
                    role="progressbar"
                    :aria-label="`Progresso de leitura de ${book.work.title}`"
                    :aria-valuenow="progressOf(book)"
                    aria-valuemin="0"
                    aria-valuemax="100"
                  >
                    <div class="progress-bar-fill" :style="{ width: `${progressOf(book)}%` }" />
                  </div>
                  <p class="progress-pages">
                    <template v-if="book.total_pages">
                      Página {{ book.pages_read }} de {{ book.total_pages }}
                    </template>
                    <template v-else>
                      {{ book.pages_read }} páginas lidas
                    </template>
                  </p>
                </div>
                <p v-else-if="book.started_on" class="progress-pages">
                  Começou em {{ formatReadingDate(book.started_on) }}
                </p>

                <NuxtLink
                  :to="`/entrada/${book.id}`"
                  class="continue-link"
                  :aria-label="`Continuar lendo ${book.work.title}`"
                >
                  Continuar lendo
                </NuxtLink>
              </div>
            </article>
          </div>
        </section>

        <ShelfSection v-if="shelfBooks.length > 0" :books="shelfBooks" />

        <ReadingCarousel
          v-if="completedBooks.length > 0"
          :books="completedBooks"
        />

        <section class="dashboard-section feed-section">
          <div class="section-header">
            <h2 class="section-title">O que o grupo anda lendo</h2>
            <NuxtLink to="/atividade" class="section-link">
              Ver tudo
            </NuxtLink>
          </div>

          <EmptyState
            v-if="entries.length === 0"
            title="Ninguém registrou nada ainda. Seja o primeiro."
            action-label="Registrar leitura"
            action-href="/app/novo"
          />

          <div v-else class="feed-list">
            <FeedItem
              v-for="(entry, i) in entries"
              :key="entry.id"
              :entry="entry"
              :loading="i < 2 ? 'eager' : 'lazy'"
            />
          </div>
        </section>

        <div
          v-if="inProgressBooks.length === 0 || shelfBooks.length === 0"
          class="dashboard-empty-rows"
        >
          <section
            v-if="inProgressBooks.length === 0"
            class="dashboard-empty-row in-progress-empty-row"
            aria-label="Lendo agora"
          >
            <p class="dashboard-empty-row-text">Nada em leitura agora</p>
            <NuxtLink to="/app/novo" class="dashboard-empty-row-link">
              Começar a ler
            </NuxtLink>
          </section>

          <ShelfSection v-if="shelfBooks.length === 0" :books="shelfBooks" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import LandingView from '~/components/landing/LandingView.vue'
import BookCover from '~/components/book/BookCover.vue'
import ReadingCarousel from '~/components/dashboard/ReadingCarousel.vue'
import ShelfSection from '~/components/dashboard/ShelfSection.vue'
import FeedItem from '~/components/feed/FeedItem.vue'
import EmptyState from '~/components/ui/EmptyState.vue'
import ErrorState from '~/components/ui/ErrorState.vue'
import LoadingSkeleton from '~/components/ui/LoadingSkeleton.vue'
import { formatReadingDate } from '~/utils/entry'
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
      requestFetch<DashboardResponse>('/api/dashboard'),
      requestFetch<FeedResponse>('/api/feed/recentes'),
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

function progressOf(book: DashboardInProgressBook): number {
  if (book.percentage !== null) return book.percentage
  if (!book.total_pages) return 0
  return Math.min(100, Math.round((book.pages_read / book.total_pages) * 100))
}

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

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.dashboard-container {
  width: 100%;
  max-width: 72rem;
  margin: 0 auto;
}

.dashboard-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
}

.dashboard-section {
  display: flex;
  flex-direction: column;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.section-title {
  font-family: var(--font-serif);
  font-size: var(--font-size-xl);
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: var(--line-height-tight);
  color: var(--text-bright);
  margin: 0 0 var(--space-4);
}

.section-header .section-title {
  margin: 0;
}

.section-link {
  display: inline-flex;
  align-items: center;
  min-height: var(--target-min-size);
  font-size: var(--font-size-sm);
  color: var(--text-color);
  text-decoration: underline;
  text-decoration-color: var(--input-bg);
  text-underline-offset: 0.25em;
  white-space: nowrap;
}

.section-link:hover {
  color: var(--text-bright);
  text-decoration-color: currentColor;
}

.section-link:focus-visible,
.continue-link:focus-visible,
.dashboard-empty-row-link:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
}

.in-progress-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  column-gap: var(--space-8);
  border-top: 1px solid var(--input-bg);
}

.in-progress-card {
  display: flex;
  gap: var(--space-4);
  padding: var(--space-4) 0;
  border-bottom: 1px solid var(--input-bg);
}

.in-progress-cover-col {
  width: 64px;
  min-width: 64px;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background-color: var(--card-bg);
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
  align-items: flex-start;
  gap: var(--space-2);
  flex: 1;
  min-width: 0;
}

.in-progress-title {
  font-family: var(--font-serif);
  font-size: var(--font-size-lg);
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text-bright);
  text-decoration: none;
  line-height: var(--line-height-tight);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.in-progress-title:hover {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.in-progress-author {
  font-size: var(--font-size-sm);
  color: var(--text-color);
  margin: var(--space-1) 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.in-progress-stats {
  width: 100%;
  max-width: 16rem;
}

.progress-bar-wrap {
  width: 100%;
  height: 3px;
  background-color: var(--input-bg);
  overflow: hidden;
  margin-bottom: var(--space-1);
}

.progress-bar-fill {
  height: 100%;
  background-color: var(--text-bright);
}

.progress-pages {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--text-color);
  font-variant-numeric: tabular-nums;
}

.continue-link {
  display: inline-flex;
  align-items: center;
  min-height: var(--space-8);
  margin-top: auto;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-bright);
  text-decoration: underline;
  text-decoration-color: var(--highlight);
  text-decoration-thickness: 2px;
  text-underline-offset: 0.3em;
}

.continue-link:hover {
  color: var(--highlight);
}

@media (pointer: coarse) {
  .continue-link {
    min-height: var(--target-min-size);
  }
}

.dashboard-empty-rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-top: calc(-1 * var(--space-8));
}

.dashboard-empty-row {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-3);
}

.dashboard-empty-row-text {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-color);
}

.dashboard-empty-row-link {
  display: inline-flex;
  align-items: center;
  min-height: var(--target-min-size);
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-bright);
  text-decoration: underline;
  text-decoration-color: var(--highlight);
  text-underline-offset: 0.3em;
}

.feed-list {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--input-bg);
}

@media (max-width: 600px) {
  .dashboard-content {
    gap: var(--space-10);
  }

  .in-progress-grid {
    grid-template-columns: 1fr;
  }

  .in-progress-cover-col {
    width: 56px;
    min-width: 56px;
  }
}
</style>
