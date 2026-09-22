<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
useHead({
  titleTemplate: (chunk?: string) => {
    if (!chunk || chunk === 'Meus Livros') return 'Meus Livros'
    return chunk.includes('Meus Livros') ? chunk : `${chunk} — Meus Livros`
  },
})
</script>

<style>
body {
  background-color: var(--bg-color);
  color: #fff;
  font-family: var(--font-sans);
  margin: 0;
  overflow-y: scroll;
}

/* Global accessible focus indicator for keyboard users */
:focus-visible {
  outline: var(--focus-ring-width, 2px) solid var(--focus-ring-color, var(--highlight));
  outline-offset: var(--focus-ring-offset, 2px);
}

/* Neutralize motion for users requesting reduced motion */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
</style>
