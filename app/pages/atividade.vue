<template>
  <div class="activity-page">
    <header class="page-header">
      <h1 class="page-title">Atividade do grupo</h1>
      <p class="page-subtitle">Todas as leituras registradas pelos membros</p>
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
          class="btn-secondary btn-load-more"
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
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import FeedItem from '~/components/feed/FeedItem.vue'
import EmptyState from '~/components/ui/EmptyState.vue'
import ErrorState from '~/components/ui/ErrorState.vue'
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
</script>

<style scoped>
.activity-page {
  width: 100%;
  max-width: 48rem;
  margin: 0 auto;
}

.page-header {
  margin-bottom: var(--space-6);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--input-bg);
}

.page-title {
  font-family: var(--font-serif);
  font-size: var(--font-size-2xl);
  font-weight: 600;
  letter-spacing: -0.015em;
  color: #fff;
  margin: 0 0 var(--space-1) 0;
  line-height: var(--line-height-tight);
}

.page-subtitle {
  font-size: var(--font-size-sm);
  color: var(--text-color);
  margin: 0;
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
  gap: var(--space-4);
}

.load-more-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-4);
  padding-bottom: var(--space-8);
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

.btn-secondary:hover:not(:disabled) {
  color: #fff;
  border-color: var(--highlight);
  background-color: var(--input-bg);
}

.btn-secondary:active:not(:disabled) {
  transform: translateY(1px);
}

.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
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
