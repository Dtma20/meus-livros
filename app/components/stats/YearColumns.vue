<template>
  <div v-if="items && items.length > 0" class="year-columns">
    <h2 class="year-columns-title">
      {{ title }}
    </h2>
    <div class="year-columns-scroll">
      <ol class="year-columns-track">
        <li
          v-for="item in items"
          :key="item.year"
          class="year-columns-item"
        >
          <NuxtLink
            :to="getYearUrl(item.year)"
            class="year-column"
            :class="{ 'is-highlight': isHighlighted(item.year) }"
            :aria-current="isHighlighted(item.year) ? 'page' : undefined"
            :aria-label="formatAriaLabel(item)"
          >
            <span class="column-count" aria-hidden="true">
              {{ formatThousands(item.books) }}
            </span>
            <div class="column-bar-track" aria-hidden="true">
              <div
                class="column-bar bar"
                :style="{ height: `${getHeightPercent(item.books)}%` }"
              />
            </div>
            <span class="column-year" aria-hidden="true">
              {{ item.year }}
            </span>
          </NuxtLink>
        </li>
      </ol>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatThousands } from '~/utils/number'

export interface YearColumnItem {
  year: number
  books: number
  pages: number
}

const props = withDefaults(
  defineProps<{
    items?: YearColumnItem[]
    title: string
    highlightYear?: number | null
    basePath: string
  }>(),
  {
    items: () => [],
    highlightYear: null,
  },
)

const maxBooks = computed(() => {
  if (!props.items || props.items.length === 0) return 0
  return Math.max(...props.items.map((i) => i.books), 0)
})

function getHeightPercent(books: number): number {
  const max = maxBooks.value
  if (max <= 0) return 0
  return (books / max) * 100
}

function getYearUrl(year: number): string {
  const base = props.basePath.replace(/\/+$/, '')
  return `${base}/ano/${year}`
}

function isHighlighted(year: number): boolean {
  return props.highlightYear !== null && props.highlightYear !== undefined && props.highlightYear === year
}

function formatAriaLabel(item: YearColumnItem): string {
  const booksText = `${formatThousands(item.books)} ${item.books === 1 ? 'livro' : 'livros'}`
  const pagesText = `${formatThousands(item.pages)} ${item.pages === 1 ? 'página' : 'páginas'}`
  return `${item.year}: ${booksText}, ${pagesText}`
}
</script>

<style scoped>
.year-columns {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 100%;
  box-sizing: border-box;
}

.year-columns-title {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--poster-border);
  margin: 0;
  line-height: var(--line-height-tight);
}

.year-columns-scroll {
  overflow-x: auto;
  max-width: 100%;
  -webkit-overflow-scrolling: touch;
  padding-bottom: var(--space-1);
}

.year-columns-track {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
  min-width: 100%;
  width: max-content;
}

.year-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  min-width: var(--target-min-size);
  text-decoration: none;
  box-sizing: border-box;
  padding: var(--space-1) 0;
  border-radius: var(--radius-sm);
}

.year-column:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.column-count {
  font-size: var(--font-size-xs);
  color: var(--text-color);
  line-height: var(--line-height-tight);
  margin-bottom: var(--space-1);
}

.year-column.is-highlight .column-count {
  color: var(--highlight);
  font-weight: 600;
}

.column-bar-track {
  width: var(--space-6);
  height: 120px;
  background-color: var(--card-bg);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  display: flex;
  align-items: flex-end;
}

.column-bar {
  width: 100%;
  background-color: var(--text-color);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  transition: height 0.2s ease, background-color 0.2s ease;
}

.year-column.is-highlight .column-bar {
  background-color: var(--highlight);
}

.year-column:hover .column-bar {
  opacity: 0.85;
}

.column-year {
  font-size: var(--font-size-xs);
  color: var(--text-color);
  line-height: var(--line-height-tight);
  margin-top: var(--space-1);
}

.year-column.is-highlight .column-year {
  color: var(--poster-border);
  font-weight: 600;
}

@media (prefers-reduced-motion: reduce) {
  .column-bar {
    transition: none;
  }
}
</style>
