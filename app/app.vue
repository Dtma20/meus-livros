<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
useHead({
  // Each page sets its own title verbatim. No site-name suffix: the tab is
  // already the route, and repeating the brand on every one of them reads as
  // noise.
  titleTemplate: (chunk?: string) => chunk || 'Meus Livros',
})
</script>

<style>
body {
  background-color: var(--bg-color);
  color: #fff;
  font-family: var(--font-sans);
  margin: 0;
  overflow-y: scroll;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

h1, h2, h3 {
  font-family: var(--font-serif);
  font-weight: 600;
  letter-spacing: -0.015em;
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
