<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
useHead({
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

button, input, select, textarea {
  font: inherit;
}

button {
  color: inherit;
}

a, button, [role="button"], summary {
  -webkit-tap-highlight-color: transparent;
}

::selection {
  background: var(--highlight);
  color: var(--bg-color);
}

input::placeholder, textarea::placeholder {
  color: var(--text-color);
  opacity: 1;
}

h1, h2, h3 {
  font-family: var(--font-serif);
  font-weight: 600;
  letter-spacing: -0.015em;
}

:focus-visible:not(:where(input, select, textarea)),
input:is([type='checkbox'], [type='radio'], [type='range'], [type='button'], [type='submit'], [type='reset'], [type='image']):focus-visible {
  outline: var(--focus-ring-width, 2px) solid var(--focus-ring-color, var(--highlight));
  outline-offset: var(--focus-ring-offset, 2px);
}

:where(input, select, textarea):not(:where([type='checkbox'], [type='radio'], [type='range'], [type='button'], [type='submit'], [type='reset'], [type='image'])):focus {
  outline: none;
  border-color: var(--highlight);
}

.page-enter-active,
.page-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

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
