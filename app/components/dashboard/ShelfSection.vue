<template>
  <section
    v-if="books.length === 0"
    class="shelf-empty-row"
    aria-label="Minha estante"
  >
    <p class="shelf-empty-row-text">Nenhum livro esperando na estante</p>
    <NuxtLink to="/app/novo?tab=novo" class="shelf-empty-row-link">
      Adicionar livro <span aria-hidden="true">→</span>
    </NuxtLink>
  </section>

  <section v-else class="dashboard-section shelf-section">
    <div class="section-header">
      <div>
        <h2 class="section-title">Minha estante</h2>
        <p class="section-subtitle">
          {{ books.length }} {{ books.length === 1 ? 'livro cadastrado aguardando leitura' : 'livros cadastrados aguardando leitura' }}
        </p>
      </div>
    </div>

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
.shelf-section {
  margin-top: var(--space-2);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: var(--space-4);
  gap: var(--space-4);
  flex-wrap: wrap;
}

.section-title {
  font-family: var(--font-serif);
  font-size: var(--font-size-xl);
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #fff;
  margin: 0;
}

.section-subtitle {
  font-size: var(--font-size-sm);
  color: var(--text-color);
  margin: var(--space-1) 0 0;
}

.shelf-empty-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  background-color: var(--card-bg);
  border: 1px solid var(--input-bg);
  border-radius: var(--radius-md);
  box-sizing: border-box;
}

.shelf-empty-row-text {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: var(--font-size-xs);
  line-height: var(--line-height-tight);
  color: var(--text-color);
}

.shelf-empty-row-link {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  min-height: var(--target-min-size);
  padding: 0 var(--space-1);
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--highlight);
  text-decoration: none;
  white-space: nowrap;
  box-sizing: border-box;
}

.shelf-empty-row-link:hover {
  text-decoration: underline;
}

.shelf-empty-row-link:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
}

.shelf-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-4);
}

.shelf-card {
  display: flex;
  gap: var(--space-4);
  background-color: var(--card-bg);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}

.shelf-cover-col {
  width: 70px;
  min-width: 70px;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--input-bg);
  background-color: var(--input-bg);
  flex-shrink: 0;
}

.shelf-cover-link {
  display: block;
  width: 100%;
  height: 100%;
}

.shelf-info-col {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  flex: 1;
  min-width: 0;
}

.shelf-meta {
  margin-bottom: var(--space-2);
}

.shelf-title {
  font-family: var(--font-serif);
  font-size: var(--font-size-lg);
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #fff;
  text-decoration: none;
  line-height: var(--line-height-tight);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.shelf-title:hover {
  color: var(--highlight);
}

.shelf-author {
  font-size: var(--font-size-xs);
  color: var(--text-color);
  margin: var(--space-1) 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shelf-year {
  display: inline-block;
  font-size: var(--font-size-xs);
  color: var(--text-color);
  margin-top: var(--space-1);
}

.shelf-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-top: var(--space-2);
}

.btn-start-reading {
  display: inline-flex;
  align-items: center;
  min-height: var(--space-8);
  padding: 0 var(--space-3);
  box-sizing: border-box;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--highlight);
  text-decoration: none;
  border-radius: var(--radius-sm);
  background-color: var(--highlight-soft);
  border: 1px solid var(--highlight-glow);
  transition: background-color 0.15s, border-color 0.15s;
}

.btn-start-reading:hover {
  background-color: var(--highlight-glow);
  border-color: var(--highlight);
}

.btn-start-reading:active {
  transform: translateY(1px);
}

.btn-start-reading:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
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
</style>
