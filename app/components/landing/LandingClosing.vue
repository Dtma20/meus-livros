<template>
  <section class="landing-closing" aria-labelledby="closing-heading">
    <div class="closing-card-box">
      <div class="closing-logo-wrap">
        <AppLogo :size="48" />
      </div>
      <div class="closing-eyebrow">CÍRCULO UNIVERSITÁRIO</div>
      <h2 id="closing-heading" class="closing-title-serif">
        Pronto para cultivar seu diário de leitura?
      </h2>
      <div class="closing-button-group">
        <NuxtLink to="/entrar" class="btn-primary btn-lg btn-closing-action">
          <span>Entrar na sua conta</span>
          <svg class="btn-arrow-icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 8h10M9 4l4 4-4 4" />
          </svg>
        </NuxtLink>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import AppLogo from '~/components/ui/AppLogo.vue'
</script>

<style scoped>
.landing-closing {
  width: 100%;
  margin-bottom: var(--space-4);
}

.closing-card-box {
  background: linear-gradient(180deg, var(--card-bg) 0%, rgba(35, 42, 49, 0.7) 100%);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: var(--radius-lg);
  padding: var(--space-10) var(--space-6);
  text-align: center;
  max-width: 95vw;
  margin: 0 auto;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
}

.closing-logo-wrap {
  display: flex;
  justify-content: center;
  margin-bottom: var(--space-4);
}

.closing-eyebrow {
  font-size: var(--font-size-xs);
  letter-spacing: 0.1em;
  color: var(--highlight);
  font-weight: 700;
  margin-bottom: var(--space-3);
}

.closing-title-serif {
  font-family: var(--font-serif);
  font-size: clamp(1.75rem, 3vw, 2.3rem);
  font-weight: 700;
  color: #fff;
  line-height: 1.2;
  margin: 0 0 var(--space-8) 0;
  letter-spacing: -0.015em;
}

.closing-body-text {
  font-size: 0.98rem;
  color: var(--text-color);
  line-height: var(--line-height-relaxed);
  max-width: 580px;
  margin: 0 auto var(--space-6) auto;
}

.closing-button-group {
  display: flex;
  justify-content: center;
  margin-bottom: var(--space-4);
}

.btn-closing-action {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-8);
  font-size: var(--font-size-base);
  font-weight: 700;
  background-color: var(--highlight);
  color: #000;
  text-decoration: none;
  border-radius: var(--radius-sm);
  border: none;
  cursor: pointer;
  min-height: 44px;
  box-sizing: border-box;
  transition: opacity 0.2s, background-color 0.2s, transform 0.2s;
}

.btn-closing-action:hover {
  opacity: 0.95;
  background-color: var(--highlight-hover);
  transform: translateY(-2px);
}

.btn-closing-action:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.btn-arrow-icon {
  transition: transform 0.2s;
}

.btn-closing-action:hover .btn-arrow-icon {
  transform: translateX(3px);
}

@media (max-width: 640px) {
  .closing-card-box {
    padding: var(--space-6) var(--space-4);
  }
}

@media (prefers-reduced-motion: reduce) {
  .btn-closing-action {
    transition: none;
    transform: none !important;
  }

  .btn-closing-action:hover .btn-arrow-icon {
    transform: none !important;
  }
}
</style>
