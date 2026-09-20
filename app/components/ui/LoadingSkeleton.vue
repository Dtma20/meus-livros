<template>
  <div class="loading-skeleton" role="status" aria-label="Carregando…">
    <div class="skeleton-grid">
      <div
        v-for="n in count"
        :key="n"
        class="skeleton-card"
        data-testid="skeleton-card"
      >
        <div class="skeleton-poster" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    count?: number
  }>(),
  {
    count: 6,
  },
)
</script>

<style scoped>
.loading-skeleton {
  width: 100%;
  box-sizing: border-box;
}

.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4, 16px);
  width: 100%;
  box-sizing: border-box;
}

@media (min-width: 600px) {
  .skeleton-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (min-width: 900px) {
  .skeleton-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}

.skeleton-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.skeleton-poster {
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm, 4px);
  background-color: var(--input-bg, #2c3440);
  border: 1px solid var(--input-bg, #2c3440);
}
</style>
