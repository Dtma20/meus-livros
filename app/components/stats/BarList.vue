<template>
  <div v-if="items && items.length > 0" class="bar-list">
    <h2 class="bar-list-title">
      {{ title }}
    </h2>
    <ol class="bar-list-items">
      <li
        v-for="item in items"
        :key="item.label"
        class="bar-list-item"
      >
        <div class="bar-item-header">
          <NuxtLink
            v-if="item.to"
            :to="item.to"
            class="bar-item-link"
          >
            {{ item.label }}
          </NuxtLink>
          <span
            v-else
            class="bar-item-label"
          >
            {{ item.label }}
          </span>
          <span class="bar-item-count">
            {{ formatCount(item.count) }}
          </span>
        </div>
        <div class="bar-track" aria-hidden="true">
          <div
            class="bar-fill bar"
            :style="{ width: getBarWidth(item.count) }"
          />
        </div>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatThousands } from '~/utils/number'

export interface BarListItem {
  label: string
  count: number
  to?: string
}

export interface BarListUnit {
  one: string
  other: string
}

const props = withDefaults(
  defineProps<{
    items?: BarListItem[]
    title: string
    unit?: BarListUnit
  }>(),
  {
    items: () => [],
    unit: () => ({ one: 'livro', other: 'livros' }),
  },
)

const maxCount = computed(() => {
  if (!props.items || props.items.length === 0) return 0
  return Math.max(...props.items.map((i) => i.count), 0)
})

function getBarWidth(count: number): string {
  const max = maxCount.value
  if (max <= 0) return '0%'
  return `${(count / max) * 100}%`
}

function formatCount(count: number): string {
  const label = count === 1 ? props.unit.one : props.unit.other
  return `${formatThousands(count)} ${label}`
}
</script>

<style scoped>
.bar-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 100%;
  box-sizing: border-box;
}

.bar-list-title {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--poster-border);
  margin: 0;
  line-height: var(--line-height-tight);
}

.bar-list-items {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

@keyframes growBarRight {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}

@keyframes barItemFadeInUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.bar-list-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  animation: barItemFadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.bar-item-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-2);
}

.bar-item-link,
.bar-item-label {
  font-size: var(--font-size-sm);
  color: var(--text-bright);
  line-height: var(--line-height-normal);
  word-break: break-word;
  overflow-wrap: break-word;
}

.bar-item-link {
  color: var(--text-bright);
  text-decoration: none;
  min-height: var(--target-min-size);
  display: inline-flex;
  align-items: center;
  transition: color 0.15s ease;
}

.bar-item-link:hover {
  text-decoration: underline;
  color: var(--highlight);
}

.bar-item-link:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
}

.bar-item-count {
  font-size: var(--font-size-xs);
  color: var(--text-color);
  white-space: nowrap;
  flex-shrink: 0;
}

.bar-track {
  width: 100%;
  height: var(--space-2);
  background-color: var(--input-bg);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background-color: var(--highlight);
  border-radius: var(--radius-sm);
  transform-origin: left;
  animation: growBarRight 0.65s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.bar-list-item:nth-child(1) .bar-fill,
.bar-list-item:nth-child(1) { animation-delay: 0.04s; }
.bar-list-item:nth-child(2) .bar-fill,
.bar-list-item:nth-child(2) { animation-delay: 0.08s; }
.bar-list-item:nth-child(3) .bar-fill,
.bar-list-item:nth-child(3) { animation-delay: 0.12s; }
.bar-list-item:nth-child(4) .bar-fill,
.bar-list-item:nth-child(4) { animation-delay: 0.16s; }
.bar-list-item:nth-child(5) .bar-fill,
.bar-list-item:nth-child(5) { animation-delay: 0.20s; }
.bar-list-item:nth-child(6) .bar-fill,
.bar-list-item:nth-child(6) { animation-delay: 0.24s; }
.bar-list-item:nth-child(7) .bar-fill,
.bar-list-item:nth-child(7) { animation-delay: 0.28s; }
.bar-list-item:nth-child(8) .bar-fill,
.bar-list-item:nth-child(8) { animation-delay: 0.32s; }
.bar-list-item:nth-child(9) .bar-fill,
.bar-list-item:nth-child(9) { animation-delay: 0.36s; }
.bar-list-item:nth-child(10) .bar-fill,
.bar-list-item:nth-child(10) { animation-delay: 0.40s; }
.bar-list-item:nth-child(n+11) .bar-fill,
.bar-list-item:nth-child(n+11) { animation-delay: 0.44s; }

@media (prefers-reduced-motion: reduce) {
  .bar-fill,
  .bar-list-item {
    animation: none;
    transition: none;
  }
}

.bar-item-label::first-letter,
.bar-item-link::first-letter {
  text-transform: uppercase;
}
</style>
