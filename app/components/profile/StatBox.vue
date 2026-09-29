<template>
  <div class="stat-box">
    <span class="stat-value">{{ formattedValue }}</span>
    <small class="stat-label">{{ label }}</small>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  value: number | string
  label: string
}>()

const formattedValue = computed(() => {
  if (typeof props.value === 'number') {
    return props.value.toLocaleString('pt-BR')
  }
  return props.value
})
</script>

<style scoped>
.stat-box {
  text-align: center;
}

.stat-value {
  font-size: var(--font-size-2xl, 1.5rem);
  font-weight: 700;
  display: block;
  color: #fff;
  line-height: var(--line-height-tight, 1.2);
}

.stat-label {
  color: var(--text-color, #9ab);
  font-size: var(--font-size-sm, 0.875rem);
  display: block;
  margin-top: var(--space-1, 4px);
}
</style>
