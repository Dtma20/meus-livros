<template>
  <nav :aria-label="year === null ? 'Período das estatísticas' : 'Outros anos'" class="year-switcher">
    <NuxtLink :to="`${basePath}/estatisticas`" class="year-switcher-link" :aria-current="year === null ? 'page' : undefined">
      Todos os anos
    </NuxtLink>
    <NuxtLink v-for="item in yearsDescending" :key="item" :to="`${basePath}/ano/${item}`" class="year-switcher-link" :aria-current="year === item ? 'page' : undefined">
      {{ item }}
    </NuxtLink>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ handle: string; years: number[]; year: number | null }>()
const basePath = computed(() => `/@${props.handle}`)
const yearsDescending = computed(() => [...props.years].sort((a, b) => b - a))
</script>

<style scoped>
.year-switcher { display: flex; gap: var(--space-2); max-width: 100%; overflow-x: auto; padding: var(--space-2); margin-bottom: var(--space-6); border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--card-bg); box-sizing: border-box; }
.year-switcher-link { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; min-height: var(--target-min-size); padding: 0 var(--space-3); border-radius: var(--radius-sm); color: var(--text-bright); font-size: var(--font-size-sm); text-decoration: none; }
.year-switcher-link[aria-current='page'] { background: var(--highlight); color: var(--on-highlight); font-weight: 700; }
.year-switcher-link:hover:not([aria-current]) { background: var(--surface-hover); color: var(--paper-white); }
.year-switcher-link:focus-visible { outline: var(--focus-ring-width) solid var(--focus-ring-color); outline-offset: var(--focus-ring-offset); }
@media (forced-colors: active) {
  .year-switcher-link[aria-current='page'] { outline: 2px solid Highlight; color: Highlight; }
}
</style>
