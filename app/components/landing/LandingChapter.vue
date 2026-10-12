<template>
  <section class="chapter" :data-scene="scene">
    <div class="chapter-inner">
      <div class="chapter-copy">
        <slot />
      </div>
      <LandingSceneMedia class="chapter-media" :scene="scene" />
    </div>
  </section>
</template>

<script setup lang="ts">
import LandingSceneMedia from '~/components/landing/LandingSceneMedia.vue'

defineProps<{
  scene: number
}>()
</script>

<style scoped>
.chapter-inner {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-6);
  margin-block: var(--space-10);
}

.chapter[data-scene='1'] .chapter-inner {
  margin-top: 0;
}

.chapter-copy {
  min-width: 0;
}

@media (min-width: 900px) {
  .chapter-inner {
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    gap: var(--space-12);
    align-items: center;
    margin-block: 0;
    padding-block: var(--space-12);
  }

  .chapter[data-scene='1'] .chapter-inner {
    padding-top: var(--space-4);
  }
}
</style>
