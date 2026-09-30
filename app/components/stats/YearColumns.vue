<template>
  <div v-if="items && items.length > 0" class="year-columns">
    <h2 class="year-columns-title">
      {{ title }}
    </h2>
    <div
      ref="scrollEl"
      class="year-columns-scroll"
      :tabindex="scrollable ? 0 : undefined"
      :role="scrollable ? 'region' : undefined"
      :aria-label="scrollable ? `${title}, role para ver outros anos` : undefined"
    >
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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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

const scrollEl = ref<HTMLElement | null>(null)
const scrollable = ref(false)

function measure(): void {
  const el = scrollEl.value
  scrollable.value = !!el && el.scrollWidth > el.clientWidth + 1
}

// Years run oldest to newest, so the chart opens on its end: the latest year is the one people look for.
// Runs only after mount, so the server render and hydration are untouched.
onMounted(() => {
  const el = scrollEl.value
  if (!el) return
  measure()
  if (scrollable.value) {
    el.scrollTo({ left: el.scrollWidth, behavior: 'instant' })
  }
  window.addEventListener('resize', measure, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', measure)
})

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
  scroll-behavior: auto;
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
  color: var(--text-color);
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

@keyframes growColumnUp {
  from {
    transform: scaleY(0);
  }
  to {
    transform: scaleY(1);
  }
}

@keyframes columnFadeInUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.year-columns-item {
  animation: columnFadeInUp 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.column-bar {
  width: 100%;
  background-color: var(--text-color);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  transform-origin: bottom;
  animation: growColumnUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
  transition: background-color 0.2s ease, opacity 0.2s ease;
}

.year-columns-item:nth-child(1) .column-bar,
.year-columns-item:nth-child(1) { animation-delay: 0.04s; }
.year-columns-item:nth-child(2) .column-bar,
.year-columns-item:nth-child(2) { animation-delay: 0.08s; }
.year-columns-item:nth-child(3) .column-bar,
.year-columns-item:nth-child(3) { animation-delay: 0.12s; }
.year-columns-item:nth-child(4) .column-bar,
.year-columns-item:nth-child(4) { animation-delay: 0.16s; }
.year-columns-item:nth-child(5) .column-bar,
.year-columns-item:nth-child(5) { animation-delay: 0.20s; }
.year-columns-item:nth-child(6) .column-bar,
.year-columns-item:nth-child(6) { animation-delay: 0.24s; }
.year-columns-item:nth-child(7) .column-bar,
.year-columns-item:nth-child(7) { animation-delay: 0.28s; }
.year-columns-item:nth-child(8) .column-bar,
.year-columns-item:nth-child(8) { animation-delay: 0.32s; }
.year-columns-item:nth-child(9) .column-bar,
.year-columns-item:nth-child(9) { animation-delay: 0.36s; }
.year-columns-item:nth-child(10) .column-bar,
.year-columns-item:nth-child(10) { animation-delay: 0.40s; }
.year-columns-item:nth-child(n+11) .column-bar,
.year-columns-item:nth-child(n+11) { animation-delay: 0.44s; }

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

.year-columns-scroll:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
}

@media (prefers-reduced-motion: reduce) {
  .column-bar,
  .year-columns-item {
    animation: none;
    transition: none;
  }
}
</style>
