<template>
  <div class="book-grid">
    <slot />
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.book-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

@media (min-width: 600px) {
  .book-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (min-width: 900px) {
  .book-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}
</style>
