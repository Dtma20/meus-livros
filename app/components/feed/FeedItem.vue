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
          :isbn13="entry.edition?.isbn13"
          :loading="loading"
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

const authorsText = computed(() => {
  if (!props.entry.work.authors || props.entry.work.authors.length === 0) return ''
  return props.entry.work.authors.map((a) => a.name).join(', ')
})
</script>

<style scoped>
.feed-row {
  display: flex;
  gap: var(--space-4);
  background-color: var(--card-bg);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}

.feed-cover-col {
  width: 70px;
  min-width: 70px;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--input-bg);
  background-color: var(--input-bg);
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
  font-size: var(--font-size-lg);
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #fff;
  text-decoration: none;
  line-height: var(--line-height-tight);
  min-width: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
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
  color: var(--text-bright);
  line-height: var(--line-height-relaxed);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

@media (max-width: 600px) {
  .feed-row {
    padding: var(--space-3);
    gap: var(--space-3);
  }

  .feed-cover-col {
    width: 60px;
    min-width: 60px;
  }
}
</style>
