<template>
  <div class="landing-hero">
    <div class="hero-text">
      <h1 id="hero-title" class="hero-title paper-text">
        Terminou o livro? Conte pro grupo.
      </h1>

      <p class="hero-lede">
        Meus Livros é o diário de leitura do clube Nerdolas. Cada livro terminado vira um registro com data, nota de meia em meia estrela e, se você quiser, uma resenha. Os registros públicos têm link próprio, feito para colar no WhatsApp.
      </p>

      <div class="hero-actions">
        <NuxtLink to="/entrar" class="hero-cta">
          Entrar
        </NuxtLink>
        <p class="hero-invite">
          <span>Só entra quem foi convidado.</span>
          <NuxtLink to="/entrar/ativar" class="hero-invite-link">
            Primeiro acesso
          </NuxtLink>
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.landing-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-10);
  padding: var(--space-4) 0 var(--space-6);
}

.hero-text {
  min-width: 0;
}

.hero-title {
  margin: 0 0 var(--space-5);
  font-family: var(--font-serif);
  font-size: clamp(2rem, 1.4rem + 3.4vw, 3.5rem);
  font-weight: 700;
  font-style: normal;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--poster-border);
  text-wrap: balance;
  overflow-wrap: anywhere;
}

.hero-lede {
  margin: 0 0 var(--space-8);
  font-size: var(--font-size-lg);
  line-height: var(--line-height-relaxed);
  color: var(--text-bright);
}

.hero-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
}

.hero-cta {
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

.hero-cta:hover {
  background-color: var(--highlight-hover);
}

.hero-cta:active {
  background-color: var(--highlight-hover);
  transform: translateY(1px);
}

.hero-cta:focus-visible,
.hero-invite-link:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.hero-invite {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: var(--space-3);
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-color);
}

.hero-invite-link {
  display: inline-flex;
  align-items: center;
  min-height: var(--target-min-size);
  color: var(--text-bright);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
  white-space: nowrap;
}

.hero-invite-link:hover {
  color: var(--highlight);
}

@media (min-width: 900px) {
  .landing-hero {
    gap: var(--space-12);
    padding: var(--space-8) 0 var(--space-12);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero-cta:active {
    transform: none;
  }
}
</style>
