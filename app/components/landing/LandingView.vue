<template>
  <div class="landing-experience">
    <LandingChapter :scene="1" aria-labelledby="hero-title">
      <LandingHero />
    </LandingChapter>
    <LandingChapter :scene="2" aria-labelledby="entry-heading">
      <LandingCommunity />
    </LandingChapter>
    <LandingChapter :scene="3" aria-labelledby="more-heading">
      <LandingPillars :row="1" with-heading />
    </LandingChapter>
    <LandingChapter :scene="4">
      <LandingPillars :row="2" />
    </LandingChapter>
    <LandingChapter :scene="5">
      <LandingPillars :row="3" />
    </LandingChapter>
    <LandingChapter :scene="6">
      <LandingPillars :row="4" />
    </LandingChapter>
    <LandingChapter :scene="7">
      <LandingPillars :row="5" />
    </LandingChapter>
    <LandingChapter :scene="8" aria-labelledby="closing-heading">
      <LandingClosing />
    </LandingChapter>
  </div>
</template>

<script setup lang="ts">
import LandingChapter from '~/components/landing/LandingChapter.vue'
import LandingHero from '~/components/landing/LandingHero.vue'
import LandingCommunity from '~/components/landing/LandingCommunity.vue'
import LandingPillars from '~/components/landing/LandingPillars.vue'
import LandingClosing from '~/components/landing/LandingClosing.vue'
</script>

<style scoped>
.landing-experience {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  width: 100%;
  max-width: 68rem;
  margin: 0 auto;
  overflow-x: clip;
}
</style>
