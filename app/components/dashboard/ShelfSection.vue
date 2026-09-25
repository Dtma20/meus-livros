<template>
  <section class="dashboard-section shelf-section">
    <div class="section-header">
      <div>
        <h2 class="section-title">Minha estante</h2>
        <p class="section-subtitle">
          <template v-if="books.length > 0">
            {{ books.length }} {{ books.length === 1 ? 'livro cadastrado aguardando leitura' : 'livros cadastrados aguardando leitura' }}
          </template>
          <template v-else>
            Livros cadastrados no catálogo sem nenhuma atividade de leitura registrada
          </template>
        </p>
      </div>

      <NuxtLink to="/app/novo" class="btn-cadastrar-shelf">
        +
      </NuxtLink>
    </div>

    <!-- Estado vazio quando não há livros na estante -->
    <div v-if="books.length === 0" class="empty-shelf">
      <p class="empty-shelf-text">
        Você não tem nenhum livro cadastrado sem atividade na sua estante no momento.
      </p>
      <NuxtLink to="/app/novo" class="btn-secondary-link">
        Cadastrar um livro na estante →
      </NuxtLink>
    </div>

    <!-- Grade de livros da estante -->
    <div v-else class="shelf-grid">
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
              title="Registrar leitura deste livro"
            >
              Começar a ler →
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

.btn-cadastrar-shelf {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--highlight);
  background-color: var(--card-bg);
  border: 1px solid var(--input-bg);
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  text-decoration: none;
  transition: border-color 0.2s, background-color 0.2s;
  white-space: nowrap;
}

.btn-cadastrar-shelf:hover {
  border-color: var(--highlight);
  background-color: var(--input-bg);
}

.btn-cadastrar-shelf:focus-visible {
  outline: 2px solid var(--highlight);
  outline-offset: 2px;
}

.empty-shelf {
  padding: var(--space-6) var(--space-4);
  background-color: var(--card-bg);
  border: 1px dashed var(--input-bg);
  border-radius: var(--radius-md);
  text-align: center;
}

.empty-shelf-text {
  font-size: var(--font-size-sm);
  color: var(--text-color);
  margin: 0 0 var(--space-3) 0;
}

.btn-secondary-link {
  display: inline-block;
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--highlight);
  text-decoration: none;
}

.btn-secondary-link:hover {
  text-decoration: underline;
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
  border: 1px solid var(--input-bg);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  transition: border-color 0.2s;
}

.shelf-card:hover {
  border-color: var(--highlight);
}

.shelf-cover-col {
  width: 70px;
  min-width: 70px;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--input-bg);
  background-color: #1e2328;
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
  font-size: 1.05rem;
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
  font-size: 11px;
  color: var(--text-color);
  opacity: 0.7;
  margin-top: 2px;
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
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--highlight);
  text-decoration: none;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  background-color: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.25);
  transition: background-color 0.2s, border-color 0.2s;
}

.btn-start-reading:hover {
  background-color: rgba(245, 158, 11, 0.2);
  border-color: var(--highlight);
}

.btn-start-reading:focus-visible {
  outline: 2px solid var(--highlight);
  outline-offset: 2px;
}

@media (max-width: 480px) {
  .shelf-grid {
    grid-template-columns: 1fr;
  }
}
</style>
