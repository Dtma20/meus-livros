<template>
  <section class="landing-closing" aria-labelledby="closing-heading">
    <h2 id="closing-heading" class="closing-heading">
      Qual foi o último livro que você terminou?
    </h2>
    <p class="closing-text">
      Entre, procure o título e registre. Se ele não estiver no catálogo, dá para adicionar à mão.
    </p>

    <div class="closing-actions">
      <NuxtLink to="/entrar" class="closing-cta">
        Entrar
      </NuxtLink>
      <NuxtLink to="/entrar/ativar" class="closing-link">
        Primeiro acesso
      </NuxtLink>
    </div>
  </section>
</template>

<style scoped>
.landing-closing {
  width: 100%;
  max-width: 40rem;
  padding-bottom: var(--space-4);
}

.closing-heading {
  margin: 0 0 var(--space-3);
  font-family: var(--font-serif);
  font-size: var(--font-size-2xl);
  font-weight: 700;
  font-style: normal;
  line-height: var(--line-height-tight);
  letter-spacing: -0.015em;
  color: var(--poster-border);
  text-wrap: balance;
}

.closing-text {
  max-width: 34rem;
  margin: 0 0 var(--space-6);
  font-size: var(--font-size-base);
  line-height: var(--line-height-relaxed);
  color: var(--text-color);
}

.closing-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-6);
}

.closing-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-height: var(--space-12);
  padding: 0 var(--space-10);
  border-radius: var(--radius-sm);
  background-color: var(--highlight);
  color: var(--bg-color);
  font-size: var(--font-size-base);
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
  transition: background-color 0.15s ease-out;
}

.closing-cta:hover {
  background-color: var(--highlight-hover);
}

.closing-cta:active {
  background-color: var(--highlight-hover);
  transform: translateY(1px);
}

.closing-link {
  display: inline-flex;
  align-items: center;
  min-height: var(--target-min-size);
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-bright);
  text-decoration: underline;
  text-underline-offset: 3px;
  white-space: nowrap;
}

.closing-link:hover {
  color: var(--highlight);
}

.closing-cta:focus-visible,
.closing-link:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

@media (min-width: 900px) {
  .closing-heading {
    font-size: var(--font-size-3xl);
  }
}

@media (prefers-reduced-motion: reduce) {
  .closing-cta:active {
    transform: none;
  }
}
</style>
