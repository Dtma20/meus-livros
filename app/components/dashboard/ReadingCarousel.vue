<template>
  <div class="carousel-section">
    <div class="carousel-header">
      <div>
        <h2 class="carousel-title">Livros já lidos</h2>
        <p class="carousel-subtitle">
          Histórico ordenado do mais recente para o mais antigo ({{ books.length }} {{ books.length === 1 ? 'leitura concluída' : 'leituras concluídas' }})
        </p>
      </div>

      <div v-if="books.length > 2" class="carousel-controls">
        <button
          type="button"
          class="carousel-nav-btn"
          aria-label="Rolar para a esquerda"
          :disabled="isAtStart"
          @click="scrollLeft"
        >
          ←
        </button>
        <button
          type="button"
          class="carousel-nav-btn"
          aria-label="Rolar para a direita"
          :disabled="isAtEnd"
          @click="scrollRight"
        >
          →
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

          <div v-if="book.rating" class="card-rating">
            <StarRating :rating="book.rating" />
          </div>

          <time class="card-date" :datetime="book.finished_on">
            {{ formatFinishedDate(book.finished_on, book.finished_precision) }}
          </time>

          <p v-if="book.review_excerpt" class="card-review-excerpt">
            "{{ book.review_excerpt }}"
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

function onScroll(): void {
  const el = trackRef.value
  if (!el) return
  isAtStart.value = el.scrollLeft <= 5
  isAtEnd.value = el.scrollLeft + el.clientWidth >= el.scrollWidth - 5
}

function scrollLeft(): void {
  const el = trackRef.value
  if (!el) return
  el.scrollBy({ left: -320, behavior: 'smooth' })
}

function scrollRight(): void {
  const el = trackRef.value
  if (!el) return
  el.scrollBy({ left: 320, behavior: 'smooth' })
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
.carousel-section {
  margin-top: var(--space-8);
}

.carousel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: var(--space-4);
}

.carousel-title {
  font-size: var(--font-size-xl);
  font-weight: 700;
  color: #fff;
  margin: 0;
}

.carousel-subtitle {
  font-size: var(--font-size-sm);
  color: var(--text-color);
  margin: var(--space-1) 0 0;
}

.carousel-controls {
  display: flex;
  gap: var(--space-2);
}

.carousel-nav-btn {
  background-color: var(--card-bg);
  border: 1px solid var(--input-bg);
  color: #fff;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: var(--font-size-base);
  transition: all 0.15s;
}

.carousel-nav-btn:hover:not(:disabled) {
  background-color: var(--input-bg);
  border-color: rgba(255, 255, 255, 0.2);
}

.carousel-nav-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.carousel-track {
  display: flex;
  gap: var(--space-4);
  overflow-x: auto;
  scroll-behavior: smooth;
  scroll-snap-type: x mandatory;
  padding-bottom: var(--space-3);
  scrollbar-width: thin;
  scrollbar-color: var(--input-bg) transparent;
}

.carousel-track::-webkit-scrollbar {
  height: 6px;
}

.carousel-track::-webkit-scrollbar-thumb {
  background-color: var(--input-bg);
  border-radius: var(--radius-full);
}

.carousel-card {
  flex: 0 0 200px;
  max-width: 220px;
  scroll-snap-align: start;
  background-color: var(--card-bg);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  transition: transform 0.15s, border-color 0.15s;
}

.carousel-card:hover {
  border-color: rgba(255, 255, 255, 0.15);
  transform: translateY(-2px);
}

.card-cover-wrap {
  width: 100%;
  aspect-ratio: 2 / 3;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background-color: var(--input-bg);
  margin-bottom: var(--space-3);
}

.cover-link {
  display: block;
  width: 100%;
  height: 100%;
}

.card-info {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.card-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: #fff;
  text-decoration: none;
  line-height: var(--line-height-tight);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: var(--space-1);
}

.card-title:hover {
  color: var(--highlight);
}

.card-author {
  font-size: var(--font-size-xs);
  color: var(--text-color);
  margin: 0 0 var(--space-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-rating {
  margin-bottom: var(--space-2);
}

.card-date {
  font-size: 11px;
  color: var(--text-color);
  opacity: 0.7;
  margin-top: auto;
}

.card-review-excerpt {
  font-size: 11px;
  font-style: italic;
  color: #94a3b8;
  margin: var(--space-2) 0 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
