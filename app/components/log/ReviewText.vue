<template>
  <div v-if="text" class="review-text">
    {{ text }}
  </div>
</template>

<script setup lang="ts">
defineProps<{
  text?: string | null
}>()
</script>

<style scoped>
.review-text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: var(--line-height-relaxed, 1.6);
  color: var(--text-color, #9ab);
  margin: 0;
}
</style>
