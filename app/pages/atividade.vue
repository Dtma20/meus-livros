<template>
  <div class="activity-page">
    <header class="page-header">
      <h1 class="page-title">O que o grupo anda lendo</h1>
    </header>

    <div
      v-if="pending"
      class="activity-loading"
      role="status"
      aria-label="Carregando a atividade…"
    >
      <div v-for="n in 4" :key="n" class="skeleton-row" aria-hidden="true">
        <div class="skeleton-cover" />
        <div class="skeleton-lines">
          <span class="skeleton-line skeleton-line-title" />
          <span class="skeleton-line skeleton-line-meta" />
          <span class="skeleton-line" />
        </div>
      </div>
    </div>

    <ErrorState
      v-else-if="error"
      title="Não foi possível carregar a atividade do grupo."
      message="Tente de novo em instantes."
      action-label="Tentar de novo"
      @retry="refresh"
    />

    <EmptyState
      v-else-if="entries.length === 0"
      title="Ninguém registrou nada ainda. Seja o primeiro."
      action-label="Registrar leitura"
      action-href="/app/novo"
    />

    <div v-else class="activity-content">
      <div class="feed-column">
        <NewPostsPill
          :visible="hasNewPosts"
          :count="newPostsCount"
          label="Novas atividades no grupo"
          @click="loadNewPosts"
        />

        <div class="feed-list">
          <FeedItem
            v-for="(entry, i) in entries"
            :key="entry.id"
            :entry="entry"
            :loading="i < 2 ? 'eager' : 'lazy'"
          />
        </div>

        <div v-if="nextCursor" class="load-more-section">
          <button
            type="button"
            class="btn btn-secondary btn-load-more"
            :disabled="loadingMore"
            @click="loadMore"
          >
            {{ loadingMore ? 'Carregando…' : 'Carregar mais' }}
          </button>
          <p v-if="loadMoreError" class="load-more-error" role="alert">
            {{ loadMoreError }}
          </p>
        </div>
      </div>

      <aside v-if="readingNow.length > 0" class="reading-now" aria-labelledby="reading-now-title">
        <h2 id="reading-now-title" class="reading-now-title">Lendo agora no grupo</h2>
        <ul class="reading-now-list">
          <li v-for="entry in readingNow" :key="entry.id" class="reading-now-item">
            <NuxtLink :to="`/entrada/${entry.id}`" class="reading-now-work">{{ entry.work.title }}</NuxtLink>
            <NuxtLink :to="`/@${entry.user.handle}`" class="reading-now-user">
              {{ entry.user.display_name || `@${entry.user.handle}` }}
            </NuxtLink>
          </li>
        </ul>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import FeedItem from '~/components/feed/FeedItem.vue'
import NewPostsPill from '~/components/feed/NewPostsPill.vue'
import EmptyState from '~/components/ui/EmptyState.vue'
import ErrorState from '~/components/ui/ErrorState.vue'
import { useFeedNewPosts } from '~/composables/useFeedNewPosts'
import type { FeedEntry, FeedPageResponse } from '~~/shared/schemas/feed'

definePageMeta({
  layout: 'app',
  middleware: 'auth',
})

useSeoMeta({
  title: 'Atividade do grupo',
})

const requestFetch = useRequestFetch()

const { data, pending, error, refresh } = await useAsyncData<FeedPageResponse>(
  'activity-feed',
  () => requestFetch<FeedPageResponse>('/api/feed', { retry: 0, timeout: 10000 }),
)

const entries = ref<FeedEntry[]>(data.value?.entries ? [...data.value.entries] : [])
const nextCursor = ref<string | null>(data.value?.nextCursor ?? null)

const readingNow = computed(() => {
  const seen = new Set<string>()
  return entries.value
    .filter((entry) => entry.started_on && !entry.finished_on)
    .filter((entry) => {
      const key = `${entry.user.handle}:${entry.work.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 8)
})
const loadingMore = ref(false)
const loadMoreError = ref<string | null>(null)

watch(data, (newVal) => {
  if (newVal) {
    entries.value = [...(newVal.entries ?? [])]
    nextCursor.value = newVal.nextCursor ?? null
  }
})

async function loadMore() {
  if (!nextCursor.value || loadingMore.value) return
  loadingMore.value = true
  loadMoreError.value = null

  try {
    const res = await $fetch<FeedPageResponse>('/api/feed', {
      params: { cursor: nextCursor.value },
      retry: 0,
      timeout: 10000,
    })
    if (res?.entries) {
      entries.value.push(...res.entries)
      nextCursor.value = res.nextCursor ?? null
    }
  } catch {
    loadMoreError.value = 'Não foi possível carregar mais atividades.'
  } finally {
    loadingMore.value = false
  }
}

const {
  hasNewPosts,
  newPostsCount,
  applyNewPosts,
} = useFeedNewPosts({
  getTopId: () => entries.value[0]?.id,
  getExistingIds: () => new Set(entries.value.map((e) => e.id)),
  fetchLatest: async () => {
    const res = await $fetch<FeedPageResponse>('/api/feed', {
      params: { limit: 20 },
      retry: 0,
      timeout: 10000,
    })
    return res?.entries ?? []
  },
})

function loadNewPosts() {
  const fresh = applyNewPosts()
  if (fresh.length > 0) {
    entries.value = [...fresh, ...entries.value]
  }
  if (import.meta.client) {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    })
  }
}
</script>

<style scoped>
.activity-page {
  width: 100%;
  max-width: 72rem;
  margin: 0 auto;
}

.activity-page > .page-header,
.activity-page > .activity-loading,
.activity-page > :deep(.empty-state),
.activity-page > :deep(.error-state) {
  max-width: 48rem;
}

.reading-now {
  display: none;
}

.reading-now-title {
  font-family: var(--font-serif);
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--text-bright);
  margin: 0 0 var(--space-3);
}

.reading-now-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--input-bg);
}

.reading-now-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--input-bg);
}

.reading-now-work {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  font-family: var(--font-serif);
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-bright);
  text-decoration: none;
}

.reading-now-user {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  font-size: var(--font-size-xs);
  color: var(--text-color);
  text-decoration: none;
}

.reading-now-work:hover,
.reading-now-user:hover {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.reading-now-work:focus-visible,
.reading-now-user:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
}

.feed-column {
  position: relative;
  width: 100%;
}

@media (min-width: 1024px) {
  .activity-page .activity-content {
    display: grid;
    grid-template-columns: minmax(0, 48rem) minmax(14rem, 18rem);
    column-gap: var(--space-12);
    align-items: start;
  }

  .reading-now {
    display: block;
    grid-column: 2;
    grid-row: 1;
    position: sticky;
    top: var(--space-6);
  }

  .feed-column {
    grid-column: 1;
    grid-row: 1;
  }
}

.page-header {
  margin-bottom: var(--space-6);
}

.page-title {
  font-family: var(--font-serif);
  font-size: var(--font-size-2xl);
  font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--text-bright);
  margin: 0;
  line-height: var(--line-height-tight);
}

.activity-loading {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin-top: var(--space-4);
}

.skeleton-row {
  display: flex;
  gap: var(--space-4);
  padding: var(--space-4);
  background-color: var(--card-bg);
  border-radius: var(--radius-md);
}

.skeleton-cover {
  width: 70px;
  min-width: 70px;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm);
  background-color: var(--input-bg);
}

.skeleton-lines {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  flex: 1;
  min-width: 0;
  padding-top: var(--space-1);
}

.skeleton-line {
  display: block;
  height: var(--space-3);
  width: 100%;
  border-radius: var(--radius-sm);
  background-color: var(--input-bg);
}

.skeleton-line-title {
  width: 60%;
  height: var(--space-4);
}

.skeleton-line-meta {
  width: 35%;
}

.activity-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.feed-list {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--input-bg);
}

.load-more-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-4);
  padding-bottom: var(--space-8);
}

.btn-load-more {
  min-width: 180px;
}

.load-more-error {
  font-size: var(--font-size-sm);
  color: var(--danger-text);
  margin: 0;
  text-align: center;
}

@media (max-width: 600px) {
  .page-header {
    margin-bottom: var(--space-4);
    padding-bottom: var(--space-3);
  }

  .page-title {
    font-size: var(--font-size-xl);
  }

  .btn-load-more {
    width: 100%;
  }

  .skeleton-row {
    padding: var(--space-3);
    gap: var(--space-3);
  }

  .skeleton-cover {
    width: 60px;
    min-width: 60px;
  }
}
</style>
