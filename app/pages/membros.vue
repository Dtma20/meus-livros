<template>
  <div class="members-page">
    <header class="members-header">
      <h1 class="page-title">Membros</h1>
    </header>

    <div v-if="pending" class="members-loading">
      <LoadingSkeleton :count="6" />
    </div>

    <ErrorState
      v-else-if="error"
      title="Algo deu errado. Tente de novo."
      action-label="Tentar de novo"
      @retry="refresh"
    />

    <EmptyState
      v-else-if="members.length === 0"
      title="Ninguém por aqui ainda."
    />

    <div v-else class="members-grid">
      <NuxtLink
        v-for="member in members"
        :key="member.handle"
        :to="`/@${member.handle}`"
        class="member-card"
      >
        <div class="member-info">
          <div class="member-header">
            <span class="member-name">{{ member.display_name }}</span>
            <span class="member-handle">
              @{{ member.handle }} &middot;
              {{ member.visible_log_count === 1 ? '1 leitura' : `${member.visible_log_count} leituras` }}
            </span>
          </div>

          <p v-if="member.bio" class="member-bio">
            {{ member.bio }}
          </p>
        </div>

        <div v-if="member.recent_covers.length > 0" class="member-covers">
          <div
            v-for="(cover, idx) in member.recent_covers.slice(0, 4)"
            :key="idx"
            class="member-cover-item"
          >
            <BookCover
              alt=""
              :title="cover.work_title"
              :cover-url="cover.cover_url"
              :ol-cover-id="cover.ol_cover_id"
              :isbn13="cover.isbn13"
              loading="lazy"
            />
          </div>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BookCover from '~/components/book/BookCover.vue'
import EmptyState from '~/components/ui/EmptyState.vue'
import ErrorState from '~/components/ui/ErrorState.vue'
import LoadingSkeleton from '~/components/ui/LoadingSkeleton.vue'
import type { MembersResponse } from '~~/shared/schemas/members'

definePageMeta({
  layout: 'app',
  middleware: 'auth',
})

useHead({
  title: 'Membros',
})

const requestFetch = useRequestFetch()

const { data, pending, error, refresh } = await useAsyncData<MembersResponse>(
  'members-list',
  () =>
    requestFetch<MembersResponse>('/api/members', {
      timeout: 10000,
      retry: 0,
    }),
)

const members = computed(() => data.value?.members ?? [])
</script>

<style scoped>
.members-page {
  width: 100%;
  max-width: 72rem;
  margin: 0 auto;
  padding: 0 0 var(--space-12);
  box-sizing: border-box;
}

.members-header {
  margin-bottom: var(--space-6);
}

.page-title {
  font-family: var(--font-serif);
  font-size: var(--font-size-3xl);
  font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--text-bright);
  margin: 0;
}

.members-loading {
  width: 100%;
}

.members-grid {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.member-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-5) 0;
  border-bottom: 1px solid var(--input-bg);
  text-decoration: none;
  color: inherit;
}

.member-card:first-child {
  border-top: 1px solid var(--input-bg);
}

.member-card:hover .member-name {
  color: var(--highlight);
}

.member-card:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.member-info {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.member-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.member-name {
  font-family: var(--font-serif);
  color: var(--text-bright);
  font-weight: 600;
  font-size: var(--font-size-xl);
  transition: color 0.2s;
  overflow-wrap: anywhere;
}

.member-handle {
  color: var(--text-color);
  font-size: var(--font-size-sm);
  font-variant-numeric: tabular-nums;
}

.member-bio {
  color: var(--text-color);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-clamp: 2;
}

.member-covers {
  display: grid;
  grid-template-columns: repeat(4, 56px);
  gap: var(--space-2);
}

.member-cover-item {
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background-color: var(--input-bg);
}

@media (max-width: 599px) {
  .member-card {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }
  .member-covers {
    grid-template-columns: repeat(4, minmax(0, 56px));
  }
}

@media (prefers-reduced-motion: reduce) {
  .member-name {
    transition: none;
  }
}
</style>
