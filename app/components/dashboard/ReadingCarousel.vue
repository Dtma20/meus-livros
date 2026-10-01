<template>
  <div class="carousel-section">
    <div class="carousel-header">
      <h2 class="carousel-title">
        Lidos
        <span class="carousel-count">{{ books.length }}</span>
      </h2>

      <div v-if="books.length > 2 && hasOverflow" class="carousel-controls">
        <button
          type="button"
          class="carousel-nav-btn"
          aria-label="Rolar para a esquerda"
          :aria-disabled="isAtStart"
          @click="scrollLeft"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          type="button"
          class="carousel-nav-btn"
          aria-label="Rolar para a direita"
          :aria-disabled="isAtEnd"
          @click="scrollRight"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>

    <div
      ref="trackRef"
      class="carousel-track"
      @scroll="onScroll"
    >
      <article
        v-for="book in books"
        :key="book.id"
        class="carousel-card"
      >
        <div class="card-cover-wrap">
          <NuxtLink :to="`/entrada/${book.id}`" class="cover-link" tabindex="-1" aria-hidden="true">
            <BookCover
              :title="book.work.title"
              :cover-url="book.work.cover_url"
              :isbn13="book.work.isbn13"
              :ol-cover-id="book.work.ol_cover_id"
              :alt="`Capa de ${book.work.title}`"
              loading="lazy"
            />
          </NuxtLink>
        </div>

        <div class="card-info">
          <NuxtLink :to="`/entrada/${book.id}`" class="card-title">
            {{ book.work.title }}
          </NuxtLink>

          <p v-if="formatAuthors(book.work.authors)" class="card-author">
            {{ formatAuthors(book.work.authors) }}
          </p>

          <div class="card-rating">
            <StarRating v-if="book.rating" :rating="book.rating" />
          </div>

          <time class="card-date" :datetime="book.finished_on">
            {{ formatFinishedDate(book.finished_on, book.finished_precision) }}
          </time>

          <p v-if="book.review_excerpt" class="card-review-excerpt">
            “{{ book.review_excerpt }}”
          </p>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import BookCover from '~/components/book/BookCover.vue'
import StarRating from '~/components/book/StarRating.vue'
import type { DashboardAuthorView, DashboardCompletedBook } from '~~/shared/schemas/dashboard'
import { formatReadingDate } from '~/utils/entry'

defineProps<{
  books: DashboardCompletedBook[]
}>()

const trackRef = ref<HTMLElement | null>(null)
const isAtStart = ref(true)
const isAtEnd = ref(false)
const hasOverflow = ref(true)

function onScroll(): void {
  const el = trackRef.value
  if (!el) return
  isAtStart.value = el.scrollLeft <= 5
  isAtEnd.value = el.scrollLeft + el.clientWidth >= el.scrollWidth - 5
  hasOverflow.value = el.scrollWidth > el.clientWidth + 5
}

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

function scrollLeft(): void {
  const el = trackRef.value
  if (!el) return
  el.scrollBy({ left: -320, behavior: scrollBehavior() })
}

function scrollRight(): void {
  const el = trackRef.value
  if (!el) return
  el.scrollBy({ left: 320, behavior: scrollBehavior() })
}

function formatAuthors(authors?: DashboardAuthorView[]): string {
  if (!authors || authors.length === 0) return ''
  return authors.map((a) => a.name).join(', ')
}

function formatFinishedDate(dateStr: string, precision: 'dia' | 'mes' | 'ano'): string {
  return formatReadingDate(dateStr, precision)
}

onMounted(() => {
  onScroll()
})
</script>

<style scoped>
.carousel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.carousel-title {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  font-family: var(--font-serif);
  font-size: var(--font-size-xl);
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: var(--line-height-tight);
  color: var(--text-bright);
  margin: 0;
}

.carousel-count {
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  font-weight: 400;
  color: var(--text-color);
  font-variant-numeric: tabular-nums;
}

.carousel-controls {
  display: flex;
  flex-shrink: 0;
  gap: var(--space-1);
}

.carousel-nav-btn {
  background: none;
  border: 1px solid transparent;
  color: var(--text-bright);
  width: var(--target-min-size);
  height: var(--target-min-size);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease, transform 0.15s ease;
}

.carousel-nav-btn:hover:not([aria-disabled="true"]) {
  border-color: var(--input-bg);
  background-color: rgba(255, 255, 255, 0.04);
  transform: scale(1.05);
}

.carousel-nav-btn:active:not([aria-disabled="true"]) {
  transform: scale(0.95);
}

.carousel-nav-btn:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.carousel-nav-btn[aria-disabled="true"] {
  color: var(--input-bg);
  cursor: default;
}

.carousel-track {
  display: flex;
  gap: var(--space-5);
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  padding-bottom: var(--space-3);
  scrollbar-width: thin;
  scrollbar-color: var(--input-bg) transparent;
}

.carousel-track::-webkit-scrollbar {
  height: 4px;
}

.carousel-track::-webkit-scrollbar-thumb {
  background-color: var(--input-bg);
  border-radius: var(--radius-full);
}

.carousel-card {
  position: relative;
  flex: 0 0 148px;
  scroll-snap-align: start;
  display: flex;
  flex-direction: column;
}

.card-cover-wrap {
  width: 100%;
  aspect-ratio: 2 / 3;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background-color: var(--card-bg);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.06);
  margin-bottom: var(--space-3);
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.2s ease, border-color 0.2s ease;
}

.carousel-card:hover .card-cover-wrap {
  transform: translateY(-3px);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.55), 0 3px 8px rgba(0, 0, 0, 0.3);
  border-color: rgba(255, 255, 255, 0.3);
}

.carousel-card:active .card-cover-wrap {
  transform: scale(0.97) translateY(0);
  transition-duration: 0.08s;
}

.cover-link {
  display: block;
  width: 100%;
  height: 100%;
}

.card-info {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.card-title {
  min-height: 24px;
  font-family: var(--font-serif);
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-bright);
  text-decoration: none;
  line-height: var(--line-height-tight);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-title::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: var(--radius-sm);
}

.carousel-card:hover .card-title {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.card-title:focus-visible {
  outline: none;
}

.card-title:focus-visible::after {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.card-author {
  font-size: var(--font-size-xs);
  color: var(--text-color);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-rating:empty {
  display: none;
}

.card-date {
  font-size: var(--font-size-xs);
  color: var(--text-color);
}

.card-review-excerpt {
  font-family: var(--font-serif);
  font-size: var(--font-size-xs);
  font-style: italic;
  line-height: var(--line-height-normal);
  color: var(--text-bright);
  margin: var(--space-1) 0 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

@media (max-width: 600px) {
  .carousel-card {
    flex-basis: 120px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .carousel-nav-btn,
  .card-cover-wrap {
    transition: none;
  }

  .carousel-card:hover .card-cover-wrap,
  .carousel-card:active .card-cover-wrap,
  .carousel-nav-btn:hover:not([aria-disabled="true"]),
  .carousel-nav-btn:active:not([aria-disabled="true"]) {
    transform: none;
  }
}
</style>
