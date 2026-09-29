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
  max-width: 65ch;
  font-family: var(--font-serif);
  font-size: var(--font-size-base);
  line-height: var(--line-height-relaxed, 1.6);
  color: var(--text-bright);
  margin: 0;
}
</style>
