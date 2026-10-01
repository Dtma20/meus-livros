<template>
  <section
    v-if="books.length === 0"
    class="shelf-empty-row"
    aria-label="Minha estante"
  >
    <p class="shelf-empty-row-text">Nenhum livro esperando na estante</p>
    <NuxtLink to="/app/novo?tab=novo" class="shelf-empty-row-link">
      Adicionar livro
    </NuxtLink>
  </section>

  <section v-else class="dashboard-section shelf-section">
    <h2 class="section-title">
      Na estante
      <span class="section-count">{{ books.length }}</span>
    </h2>

    <div class="shelf-grid">
      <article
        v-for="item in books"
        :key="item.id"
        class="shelf-card"
      >
        <div class="shelf-cover-col">
          <NuxtLink
            :to="`/livro/${item.work.slug}`"
            class="shelf-cover-link"
            tabindex="-1"
            aria-hidden="true"
          >
            <BookCover
              :alt="`Capa de ${item.work.title}`"
              :title="item.work.title"
              :cover-url="item.work.cover_url"
              :isbn13="item.work.isbn13"
              :ol-cover-id="item.work.ol_cover_id"
              loading="lazy"
            />
          </NuxtLink>
        </div>

        <div class="shelf-info-col">
          <div class="shelf-meta">
            <NuxtLink :to="`/livro/${item.work.slug}`" class="shelf-title">
              {{ item.work.title }}
            </NuxtLink>
            <p v-if="formatAuthors(item.work.authors)" class="shelf-author">
              {{ formatAuthors(item.work.authors) }}
            </p>
            <span v-if="item.work.first_published_year" class="shelf-year">
              {{ item.work.first_published_year }}
            </span>
          </div>

          <div class="shelf-actions">
            <NuxtLink
              :to="`/app/novo?work_id=${item.id}`"
              class="btn-start-reading"
              :aria-label="`Começar a ler ${item.work.title}`"
            >
              Começar a ler
            </NuxtLink>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import BookCover from '~/components/book/BookCover.vue'
import type { DashboardAuthorView, DashboardShelfBook } from '~~/shared/schemas/dashboard'

defineProps<{
  books: DashboardShelfBook[]
}>()

function formatAuthors(authors?: DashboardAuthorView[]): string {
  if (!authors || authors.length === 0) return ''
  return authors.map((a) => a.name).join(', ')
}
</script>

<style scoped>
.section-title {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  font-family: var(--font-serif);
  font-size: var(--font-size-xl);
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: var(--line-height-tight);
  color: var(--text-bright);
  margin: 0 0 var(--space-4);
}

.section-count {
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  font-weight: 400;
  color: var(--text-color);
  font-variant-numeric: tabular-nums;
}

.shelf-empty-row {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-3);
}

.shelf-empty-row-text {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-color);
}

.shelf-empty-row-link,
.btn-start-reading {
  display: inline-flex;
  align-items: center;
  min-height: var(--space-8);
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-bright);
  text-decoration: underline;
  text-decoration-color: var(--highlight);
  text-decoration-thickness: 2px;
  text-underline-offset: 0.3em;
}

.shelf-empty-row-link {
  min-height: var(--target-min-size);
}

.shelf-empty-row-link:hover,
.btn-start-reading:hover {
  color: var(--highlight);
}

.shelf-empty-row-link:focus-visible,
.btn-start-reading:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
}

.shelf-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  column-gap: var(--space-8);
  border-top: 1px solid var(--input-bg);
}

.shelf-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-2);
  margin: 0 calc(-1 * var(--space-2));
  border-bottom: 1px solid var(--input-bg);
  border-radius: var(--radius-md);
  transition: background-color 0.2s ease;
}

.shelf-card:hover {
  background-color: rgba(255, 255, 255, 0.02);
}

.shelf-cover-col {
  width: 48px;
  min-width: 48px;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background-color: var(--card-bg);
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.2s ease;
}

.shelf-card:hover .shelf-cover-col {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5);
}

.shelf-card:active .shelf-cover-col {
  transform: scale(0.97) translateY(0);
}

.shelf-cover-link {
  display: block;
  width: 100%;
  height: 100%;
}

.shelf-info-col {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
  flex: 1;
  min-width: 0;
}

.shelf-title {
  min-height: 24px;
  font-family: var(--font-serif);
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--text-bright);
  text-decoration: none;
  line-height: var(--line-height-tight);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.shelf-title::after {
  content: "";
  position: absolute;
  inset: 0;
}

.shelf-card:hover .shelf-title {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.shelf-title:focus-visible {
  outline: none;
}

.shelf-title:focus-visible::after {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
}

.btn-start-reading {
  position: relative;
  z-index: 1;
}

.shelf-author,
.shelf-year {
  font-size: var(--font-size-xs);
  color: var(--text-color);
  margin: 0;
}

.shelf-author {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shelf-meta {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

@media (pointer: coarse) {
  .btn-start-reading {
    min-height: var(--target-min-size);
  }
}

@media (max-width: 480px) {
  .shelf-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .shelf-card,
  .shelf-cover-col {
    transition: none;
  }

  .shelf-card:hover .shelf-cover-col,
  .shelf-card:active .shelf-cover-col {
    transform: none;
  }
}
</style>
