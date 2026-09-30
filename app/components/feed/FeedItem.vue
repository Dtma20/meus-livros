<template>
  <article class="feed-row">
    <div class="feed-cover-col">
      <NuxtLink
        :to="`/entrada/${entry.id}`"
        class="feed-cover-link"
        tabindex="-1"
        aria-hidden="true"
      >
        <BookCover
          :alt="authorsText ? `Capa de ${entry.work.title}, de ${authorsText}` : `Capa de ${entry.work.title}`"
          :title="entry.work.title"
          :cover-url="entry.edition?.cover_url || entry.work.cover_url"
          :ol-cover-id="entry.edition?.ol_cover_id"
          :isbn13="entry.edition?.isbn13 || entry.work.isbn13"
          :loading="loading"
        />
      </NuxtLink>
    </div>

    <div class="feed-body-col">
      <p class="feed-meta">
        <NuxtLink :to="`/@${entry.user.handle}`" class="feed-user-link">
          {{ entry.user.display_name || `@${entry.user.handle}` }}
        </NuxtLink>
        <span class="feed-action">{{ actionText }}</span>
        <span class="feed-relative-date" :title="formatFullDate(entry.created_at)">
          {{ formatRelativeDate(entry.created_at) }}
        </span>
      </p>

      <NuxtLink :to="`/entrada/${entry.id}`" class="feed-work-title">
        {{ entry.work.title }}
      </NuxtLink>
      <p v-if="authorsText" class="feed-authors">{{ authorsText }}</p>

      <div v-if="entry.rating" class="feed-rating">
        <StarRating :rating="entry.rating" />
      </div>

      <blockquote v-if="entry.review_excerpt" class="feed-review-excerpt">
        {{ entry.review_excerpt }}
      </blockquote>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BookCover from '~/components/book/BookCover.vue'
import StarRating from '~/components/book/StarRating.vue'
import { formatFullDate, formatRelativeDate } from '~/utils/date'
import type { FeedEntry } from '~~/shared/schemas/feed'

const props = withDefaults(
  defineProps<{
    entry: FeedEntry
    loading?: 'eager' | 'lazy'
  }>(),
  {
    loading: 'lazy',
  },
)

const actionText = computed(() => {
  if (props.entry.finished_on) return props.entry.review_excerpt ? 'terminou e comentou' : 'terminou'
  if (props.entry.started_on) return 'começou a ler'
  return 'registrou'
})

const authorsText = computed(() => {
  if (!props.entry.work.authors || props.entry.work.authors.length === 0) return ''
  return props.entry.work.authors.map((a) => a.name).join(', ')
})
</script>

<style scoped>
.feed-row {
  position: relative;
  display: flex;
  gap: var(--space-4);
  padding: var(--space-5) 0;
  border-bottom: 1px solid var(--input-bg);
}

.feed-cover-col {
  width: 56px;
  min-width: 56px;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background-color: var(--card-bg);
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
  align-items: flex-start;
  flex: 1;
  min-width: 0;
}

.feed-meta {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0 0.3em;
  margin: 0 0 var(--space-1);
  font-size: var(--font-size-sm);
}

.feed-user-link {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  min-width: 24px;
  color: var(--text-bright);
  font-weight: 600;
  text-decoration: none;
}

.feed-user-link:hover {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.feed-action {
  color: var(--text-color);
}

.feed-relative-date {
  font-size: var(--font-size-xs);
  color: var(--text-color);
  white-space: nowrap;
}

.feed-work-title {
  min-height: 24px;
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

.feed-work-title:hover {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.feed-work-title:focus-visible,
.feed-user-link:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
}

.feed-authors {
  margin: var(--space-1) 0 0;
  font-size: var(--font-size-sm);
  color: var(--text-color);
}

.feed-rating {
  margin-top: var(--space-2);
}

.feed-review-excerpt {
  max-width: 60ch;
  margin: var(--space-3) 0 0;
  font-family: var(--font-serif);
  font-style: italic;
  font-size: var(--font-size-base);
  line-height: var(--line-height-relaxed);
  color: var(--text-bright);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.feed-work-title::after {
  content: "";
  position: absolute;
  inset: 0;
}

.feed-user-link {
  position: relative;
  z-index: 1;
}

@media (pointer: coarse) {
  .feed-user-link {
    min-height: 44px;
    min-width: 44px;
    margin-block: -10px;
  }
}

@media (max-width: 600px) {
  .feed-row {
    gap: var(--space-3);
    padding: var(--space-4) 0;
  }

  .feed-cover-col {
    width: 48px;
    min-width: 48px;
  }
}
</style>
