<template>
  <div class="landing-experience">
    <LandingHero />
    <LandingPillars />
    <LandingCommunity />
    <LandingClosing />
  </div>
</template>

<script setup lang="ts">
import LandingHero from '~/components/landing/LandingHero.vue'
import LandingPillars from '~/components/landing/LandingPillars.vue'
import LandingCommunity from '~/components/landing/LandingCommunity.vue'
import LandingClosing from '~/components/landing/LandingClosing.vue'
</script>

<style scoped>
.landing-experience {
  display: flex;
  flex-direction: column;
  gap: var(--space-16);
  width: 100%;
}

@media (max-width: 640px) {
  .landing-experience {
    gap: var(--space-12);
  }
}
</style>
