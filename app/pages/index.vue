<template>
  <div class="home-page">
    <!-- Anonymous state: stranger landing -->
    <div v-if="!isAuthenticated" class="landing-hero">
      <div class="landing-card">
        <div class="landing-badge">Início</div>
        <h1 class="landing-title">Meus Livros</h1>
        <p class="landing-tagline">
          Uma pequena biblioteca compartilhada de leituras entre amigos.
        </p>
        <p class="landing-description">
          Acompanhe o que o grupo está lendo, registre seus livros,
          escreva resenhas e preserve seu histórico de leitura.
        </p>

        <div class="landing-actions">
          <NuxtLink to="/entrar" class="btn-primary btn-lg">
            Entrar
          </NuxtLink>
        </div>

        <p class="landing-note">
          Acesso restrito para convidados. Se você já tem acesso, entre com seu e-mail cadastrado.
        </p>
      </div>
    </div>

    <!-- Authenticated state: member feed -->
    <div v-else class="feed-container">
      <header class="feed-header">
        <div class="feed-header-text">
          <h1 class="feed-title">Início</h1>
          <p class="feed-subtitle">Leituras recentes</p>
        </div>
        <NuxtLink to="/app/novo" class="btn-primary btn-register">
          Registrar livro
        </NuxtLink>
      </header>

      <!-- Loading state while feed is fetching -->
      <div v-if="pending" class="feed-loading">
        <LoadingSkeleton :count="4" />
      </div>

      <!-- Error state when feed fails to load -->
      <ErrorState
        v-else-if="hasFeedError"
        title="Algo deu errado. Tente de novo."
        message="Não foi possível carregar as leituras recentes."
        action-label="Tentar de novo"
        @retry="refresh"
      />

      <!-- Empty state when no visible logs exist -->
      <EmptyState
        v-else-if="entries.length === 0"
        icon="📚"
        title="Ninguém registrou nada ainda. Seja o primeiro."
        action-label="Registrar livro"
        action-href="/app/novo"
      />

      <!-- Strip of up to 10 most recent entries -->
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BookCover from '~/components/book/BookCover.vue'
import StarRating from '~/components/book/StarRating.vue'
import EmptyState from '~/components/ui/EmptyState.vue'
import ErrorState from '~/components/ui/ErrorState.vue'
import LoadingSkeleton from '~/components/ui/LoadingSkeleton.vue'
import { formatFullDate, formatRelativeDate } from '~/utils/date'
import type { AuthSessionState } from '~/middleware/auth'
import type { FeedEntry, FeedResponse } from '~~/shared/schemas/feed'

interface HomeAsyncData {
  authenticated: boolean
  entries: FeedEntry[]
  hasFeedError: boolean
  redirectTo?: string
}

// `/` is the one route whose layout depends on the viewer. That decision lives
// in middleware and not here: `setPageLayout` inside `setup()` raises
// NUXT_E2007 and hands the client a different shell than the server rendered.
definePageMeta({
  middleware: 'home-layout',
})

const requestFetch = useRequestFetch()

// The `home-layout` middleware has already resolved `/api/users/me` into the
// shared `auth:session` state, on whichever side is rendering. Reading it here
// keeps this page at one round trip instead of asking the same question twice.
const session = useState<AuthSessionState>('auth:session', () => ({
  user: null,
  fetched: false,
}))

// Server-rendered with useAsyncData. Three states of the session:
// 1. no user: unauthenticated stranger -> landing, and no book data in the payload.
// 2. user without profile: verified identity with no `users` row -> /app/bem-vindo.
// 3. user with profile: member -> fetch the feed.
const { data: pageData, pending, refresh } = await useAsyncData<HomeAsyncData>('home-feed', async () => {
  const current = session.value

  if (!current?.user) {
    return {
      authenticated: false,
      entries: [],
      hasFeedError: false,
    }
  }

  const hasProfile = Boolean(current.hasProfile || current.user.hasProfile || current.user.handle)

  if (!hasProfile) {
    return {
      authenticated: false,
      entries: [],
      hasFeedError: false,
      redirectTo: '/app/bem-vindo',
    }
  }

  try {
    const feed = await requestFetch<FeedResponse>('/api/feed/recentes')
    return {
      authenticated: true,
      entries: feed?.entries ?? [],
      hasFeedError: false,
    }
  }
  catch {
    return {
      authenticated: true,
      entries: [],
      hasFeedError: true,
    }
  }
})

if (pageData.value?.redirectTo) {
  await navigateTo(pageData.value.redirectTo)
}

const isAuthenticated = computed(() => Boolean(pageData.value?.authenticated))
const entries = computed(() => pageData.value?.entries ?? [])
const hasFeedError = computed(() => Boolean(pageData.value?.hasFeedError))

function formatAuthors(authors?: { name: string }[]): string {
  if (!authors || authors.length === 0) return ''
  return authors.map((a) => a.name).join(', ')
}

// Open Graph / SEO metadata
const reqUrl = useRequestURL()
const origin = computed(() => reqUrl?.origin || 'http://localhost:3000')

useSeoMeta({
  title: 'Início — Meus Livros',
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

/* Landing state for strangers */
.landing-hero {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: var(--space-8) 0;
}

.landing-card {
  width: 100%;
  max-width: 560px;
  background-color: var(--card-bg);
  border: 1px solid var(--input-bg);
  border-radius: var(--radius-md);
  padding: var(--space-8);
  text-align: center;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.landing-badge {
  display: inline-block;
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--highlight);
  font-weight: 700;
  margin-bottom: var(--space-2);
}

.landing-title {
  font-size: var(--font-size-3xl);
  font-weight: 800;
  color: #fff;
  margin: 0 0 var(--space-3) 0;
  line-height: var(--line-height-tight);
}

.landing-tagline {
  font-size: var(--font-size-lg);
  color: #fff;
  margin: 0 0 var(--space-4) 0;
  line-height: var(--line-height-normal);
}

.landing-description {
  font-size: var(--font-size-base);
  color: var(--text-color);
  line-height: var(--line-height-relaxed);
  margin: 0 auto var(--space-6) auto;
  max-width: 440px;
}

.landing-actions {
  display: flex;
  justify-content: center;
  margin-bottom: var(--space-6);
}

.landing-note {
  font-size: var(--font-size-xs);
  color: var(--text-color);
  margin: 0;
  line-height: var(--line-height-normal);
  opacity: 0.85;
}

/* Buttons */
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

.btn-lg {
  padding: var(--space-3) var(--space-8);
  font-size: var(--font-size-base);
}

.btn-register {
  padding: var(--space-2) var(--space-4);
  font-size: var(--font-size-sm);
}

/* Authenticated feed */
.feed-container {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
}

.feed-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--input-bg);
}

.feed-title {
  font-size: var(--font-size-2xl);
  font-weight: 700;
  color: #fff;
  margin: 0 0 var(--space-1) 0;
  line-height: var(--line-height-tight);
}

.feed-subtitle {
  font-size: var(--font-size-sm);
  color: var(--text-color);
  margin: 0;
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
  font-size: var(--font-size-base);
  font-weight: 700;
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

  .feed-header {
    margin-bottom: var(--space-4);
    padding-bottom: var(--space-3);
  }

  .feed-title {
    font-size: var(--font-size-xl);
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
