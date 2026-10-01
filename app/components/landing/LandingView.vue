<template>
  <div class="landing-experience">
    <LandingHero />
    <LandingCommunity />
    <LandingPillars />
    <LandingClosing />
  </div>
</template>

<script setup lang="ts">
import LandingHero from '~/components/landing/LandingHero.vue'
import LandingCommunity from '~/components/landing/LandingCommunity.vue'
import LandingPillars from '~/components/landing/LandingPillars.vue'
import LandingClosing from '~/components/landing/LandingClosing.vue'
</script>

<style scoped>
.landing-experience {
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
  width: 100%;
  max-width: 68rem;
  margin: 0 auto;
  overflow-x: clip;
}

@media (min-width: 900px) {
  .landing-experience {
    gap: var(--space-16);
  }
}
</style>
