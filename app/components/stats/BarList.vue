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

.bar-list-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
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

}

@media (prefers-reduced-motion: reduce) {
  .bar-fill {
    transition: none;
  }
}

.bar-item-label::first-letter,
.bar-item-link::first-letter {
  text-transform: uppercase;
}
</style>
