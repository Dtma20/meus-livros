<template>
  <div
    class="app-logo-wrapper"
    :class="{ 'with-text': showText, 'with-badge': badge }"
    :style="{ '--logo-size': `${resolvedSize}px` }"
  >
    <svg
      class="app-logo-icon"
      :width="resolvedSize"
      :height="resolvedSize"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M23 14C18 11.5 12 11.5 7 13.5V37C12 35 18 35 23 37.5V14Z" fill="currentColor" />
      <path d="M25 14C30 11.5 36 11.5 41 13.5V37C36 35 30 35 25 37.5V14Z" fill="currentColor" fill-opacity="0.72" />
    </svg>

    <span v-if="showText" class="logo-text">
      Meus Livros
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    size?: number | string
    showText?: boolean
    badge?: boolean
  }>(),
  {
    size: 28,
    showText: false,
    badge: false,
  },
)

const resolvedSize = computed(() => {
  if (typeof props.size === 'number') return props.size
  const parsed = parseInt(props.size, 10)
  return Number.isNaN(parsed) ? 28 : parsed
})
</script>

<style scoped>
.app-logo-wrapper {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  vertical-align: middle;
  line-height: 1;
}

.app-logo-icon {
  display: block;
  flex-shrink: 0;
  color: var(--highlight);
}

.logo-text {
  font-family: var(--font-serif);
  font-weight: 600;
  color: var(--text-bright);
  letter-spacing: -0.01em;
  font-size: var(--font-size-xl);
}
</style>
