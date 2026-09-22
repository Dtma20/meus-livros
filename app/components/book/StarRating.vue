<template>
  <span
    v-if="ratingText"
    role="img"
    :aria-label="ariaLabel"
    class="stars"
  >{{ ratingText }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  rating?: number | null
}>()

const ratingText = computed(() => {
  if (props.rating == null || props.rating <= 0 || Number.isNaN(props.rating)) {
    return ''
  }
  const r = props.rating
  return '★'.repeat(Math.floor(r)) + (r % 1 !== 0 ? '½' : '')
})

const ariaLabel = computed(() => {
  if (props.rating == null || props.rating <= 0 || Number.isNaN(props.rating)) {
    return ''
  }
  const formatted = String(props.rating).replace('.', ',')
  return `${formatted} de 5 estrelas`
})
</script>

<style scoped>
.stars {
  color: var(--star-color, #f59e0b);
  font-size: 0.9rem;
  letter-spacing: 1px;
}
</style>
