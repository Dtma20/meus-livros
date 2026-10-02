<template>
  <article
    v-reveal
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
          :alt="authorsText ? `Capa de ${entry.work.title}, de ${authorsText}` : `Capa de ${entry.work.title}`"
          :title="entry.work.title"
          :cover-url="entry.edition?.cover_url || entry.work.cover_url"
          :ol-cover-id="entry.edition?.ol_cover_id"
          :isbn13="entry.edition?.isbn13 || entry.work.isbn13"
          mobile-size="small"
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
      <DiscussionThread
        v-if="entry.review_excerpt"
        :log-id="entry.id"
      />
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BookCover from '~/components/book/BookCover.vue'
import StarRating from '~/components/book/StarRating.vue'
import DiscussionThread from '~/components/comments/DiscussionThread.vue'
import { vReveal } from '~/composables/useScrollReveal'
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
  align-items: flex-start;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-3);
  margin: 0 calc(-1 * var(--space-3));
  border-bottom: 1px solid var(--input-bg);
  border-radius: var(--radius-md);
  opacity: 1;
  transform: none;
  transition: opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.4s cubic-bezier(0.16, 1, 0.3, 1),
              background-color 0.2s ease;
  transition-delay: 0s;
  will-change: opacity, transform;
  content-visibility: auto;
  contain-intrinsic-size: 0 220px;
}

.feed-row.reveal-enabled:not(.is-revealed) {
  opacity: 0;
  transform: translateY(28px);
}

.feed-row.is-revealed {
  opacity: 1;
  transform: translateY(0);
}

.feed-row.is-revealed:nth-child(1) { transition-delay: 0.04s; }
.feed-row.is-revealed:nth-child(2) { transition-delay: 0.09s; }
.feed-row.is-revealed:nth-child(3) { transition-delay: 0.14s; }
.feed-row.is-revealed:nth-child(4) { transition-delay: 0.19s; }
.feed-row.is-revealed:nth-child(5) { transition-delay: 0.24s; }
.feed-row.is-revealed:nth-child(6) { transition-delay: 0.29s; }
.feed-row.is-revealed:nth-child(7) { transition-delay: 0.34s; }
.feed-row.is-revealed:nth-child(8) { transition-delay: 0.39s; }
.feed-row:nth-child(9) { animation-delay: 0.53s; }
.feed-row:nth-child(10) { animation-delay: 0.59s; }

.feed-row:hover {
  background-color: rgba(255, 255, 255, 0.02);
}

.feed-cover-col {
  width: 125px;
  height: 187px;
  align-self: flex-start;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background-color: var(--card-bg);
  flex-shrink: 0;
  position: relative;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.2s ease;
}

.feed-row:hover .feed-cover-col {
  transform: translateY(-2px);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3);
}

.feed-row:active .feed-cover-col {
  transform: scale(0.98) translateY(0);
  transition-duration: 0.1s;
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
  transition: color 0.15s ease;
}

.feed-work-title:hover {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.feed-row:hover .feed-work-title {
  color: #fff;
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
    margin: 0;
  }

  .feed-cover-col {
    width: 48px;
    min-width: 48px;
    height: auto;
    aspect-ratio: 2 / 3;
  }
}

@media (prefers-reduced-motion: reduce) {
  .feed-row {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
  }

  .feed-row,
  .feed-cover-col,
  .feed-work-title {
    transition: none;
  }

  .feed-row:hover .feed-cover-col,
  .feed-row:active .feed-cover-col {
    transform: none;
  }
}
</style>
