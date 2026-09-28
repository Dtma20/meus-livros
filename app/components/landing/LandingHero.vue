<template>
  <section class="landing-hero" aria-labelledby="hero-title">
    <div class="hero-layout">
      <div class="hero-text-col">
        <div class="hero-kicker-wrap">
          <AppLogo :size="18" />
          <span class="landing-badge">Início</span>
          <span class="kicker-separator" aria-hidden="true">•</span>
          <span class="kicker-detail">Clube Nerdolas da Leitura</span>
        </div>

        <h1 id="hero-title" class="landing-title">
          O diário das suas leituras.<br>
          <span class="landing-title-highlight">Sem algoritmos, entre amigos.</span>
        </h1>

        <p class="landing-tagline">
          Uma estante editorial e íntima para registrar livros, notas de margem e impressões literárias. Descubra o que seu círculo está lendo de verdade, longe do ruído de feeds comerciais e métricas de vaidade.
        </p>

        <div class="hero-actions-group">
          <NuxtLink to="/entrar" class="btn-primary btn-hero">
            <span>Entrar na biblioteca</span>
            <svg class="btn-arrow-icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </NuxtLink>

          <div class="invite-only-pill" role="status">
            <span class="invite-pill-dot" aria-hidden="true" />
            <span class="invite-pill-text">Acesso exclusivo para membros convidados</span>
          </div>
        </div>
      </div>

      <div class="hero-visual-col" aria-hidden="true">
        <div class="hero-visual-backdrop" />

        <div class="hero-visual-stage">
          <div class="fan-book fan-book-left">
            <div class="fan-book-cover">
              <img
                src="https://m.media-amazon.com/images/I/810Vj9zyi-L._AC_UF1000,1000_QL80_.jpg"
                alt="Capa de A Hora da Estrela"
                class="fan-cover-img"
                loading="eager"
              >
              <div class="book-spine-shine" />
            </div>
          </div>

          <div class="fan-book fan-book-right">
            <div class="fan-book-cover">
              <img
                src="https://m.media-amazon.com/images/I/71ieivsk2zL._AC_UF1000,1000_QL80_.jpg"
                alt="Capa de 1984"
                class="fan-cover-img"
                loading="eager"
              >
              <div class="book-spine-shine" />
            </div>
          </div>

          <article class="hero-log-card">
            <header class="log-card-header">
              <div class="log-kicker">
                <span class="log-kicker-dot" aria-hidden="true" />
                <span class="log-kicker-label">Diário de Leitura</span>
              </div>
              <span class="log-meta-tag">Passagem marcante</span>
            </header>

            <div class="log-card-body">
              <div class="log-book-cover-wrap">
                <img
                  src="https://m.media-amazon.com/images/I/61EVp+EGGXL._AC_UF1000,1000_QL80_.jpg"
                  alt="Capa do livro Dom Casmurro, de Machado de Assis"
                  class="log-cover-real-img"
                  loading="eager"
                >
                <div class="book-spine-shine" />
              </div>

              <div class="log-content-meta">
                <div class="log-book-details">
                  <span class="log-title-serif">Dom Casmurro</span>
                  <span class="log-author-sub">Machado de Assis · 1899</span>
                </div>

                <blockquote class="log-quote-text">
                  “Olhos de ressaca? Vá, de ressaca. É o que me dá ideia daquela feição nova. Traziam não sei que fluido misterioso e enérgico, uma força que arrastava para dentro, como a vaga que se retira da praia nos dias de ressaca.”
                </blockquote>

                <div class="log-tags-row">
                  <span class="log-tag">Capítulo XXXII</span>
                  <span class="log-tag log-tag-highlight">Realismo Brasileiro</span>
                  <span class="log-tag">256 págs.</span>
                </div>
              </div>
            </div>
          </article>

          <div class="hero-floating-pill">
            <span class="floating-pill-dot" />
            <span>Sem anúncios · Sem algoritmos predatórios</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import AppLogo from '~/components/ui/AppLogo.vue'
</script>

<style scoped>
.landing-hero {
  position: relative;
  padding: var(--space-8) 0 var(--space-12) 0;
}

.hero-layout {
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  gap: var(--space-10);
  align-items: center;
}

.hero-text-col {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.hero-kicker-wrap {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.22);
  padding: 4px 12px;
  border-radius: var(--radius-full);
  margin-bottom: var(--space-4);
}

.landing-badge {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--highlight);
  font-weight: 700;
}

.kicker-separator {
  color: var(--highlight);
  font-size: 0.6rem;
  opacity: 0.6;
}

.kicker-detail {
  font-size: var(--font-size-xs);
  color: #c9d1d9;
  font-weight: 500;
}

.landing-title {
  font-family: var(--font-serif);
  font-size: clamp(2.2rem, 4vw, 3.25rem);
  font-weight: 700;
  color: #fff;
  line-height: 1.12;
  letter-spacing: -0.025em;
  margin: 0 0 var(--space-4) 0;
}

.landing-title-highlight {
  color: #e2e8f0;
  font-weight: 400;
  font-style: italic;
}

.landing-tagline {
  font-size: 1.05rem;
  color: var(--text-color);
  line-height: var(--line-height-relaxed);
  margin: 0 0 var(--space-6) 0;
  max-width: 520px;
}

.hero-actions-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: stretch;
  width: fit-content;
  max-width: 100%;
}

.btn-hero {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-6);
  font-size: var(--font-size-base);
  font-weight: 700;
  border-radius: var(--radius-sm);
  background-color: var(--highlight);
  color: #000;
  text-decoration: none;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.25);
  transition: transform 0.2s, background-color 0.2s, opacity 0.2s;
  min-height: 44px;
  box-sizing: border-box;
}

.btn-hero:hover {
  transform: translateY(-2px);
  background-color: var(--highlight-hover);
}

.btn-hero:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.btn-arrow-icon {
  transition: transform 0.2s;
}

.btn-hero:hover .btn-arrow-icon {
  transform: translateX(3px);
}

.invite-only-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--text-color);
  background-color: rgba(44, 52, 64, 0.6);
  padding: 4px 12px;
  border-radius: var(--radius-full);
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-sizing: border-box;
}

.invite-pill-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--highlight);
  box-shadow: 0 0 6px var(--highlight);
  flex-shrink: 0;
}

.hero-visual-col {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
}

.hero-visual-backdrop {
  position: absolute;
  width: 130%;
  height: 130%;
  top: -15%;
  left: -15%;
  background: radial-gradient(circle at center, rgba(245, 158, 11, 0.1) 0%, rgba(20, 24, 28, 0) 70%);
  pointer-events: none;
}

.hero-visual-stage {
  position: relative;
  width: 100%;
  max-width: 460px;
}

.fan-book {
  position: absolute;
  top: -14px;
  width: 130px;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6);
  pointer-events: none;
}

.fan-book-left {
  left: -24px;
  transform: rotate(-9deg) translateY(-8px);
  z-index: 1;
}

.fan-book-right {
  right: -20px;
  transform: rotate(8deg) translateY(-4px);
  z-index: 1;
}

.fan-book-cover {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background-color: var(--input-bg);
}

.fan-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.book-spine-shine {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 6px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0.05) 50%, transparent 100%);
  pointer-events: none;
}

.hero-log-card {
  position: relative;
  z-index: 2;
  background-color: rgba(35, 42, 49, 0.8);
  background-color: color-mix(in srgb, var(--card-bg) 80%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-md);
  padding: var(--space-5);
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.06);
}

.log-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--input-bg);
  padding-bottom: var(--space-3);
  margin-bottom: var(--space-4);
}

.log-kicker {
  display: flex;
  align-items: center;
  gap: 6px;
}

.log-kicker-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--highlight);
  box-shadow: 0 0 6px var(--highlight);
}

.log-kicker-label {
  font-size: var(--font-size-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #fff;
}

.log-meta-tag {
  font-size: 0.7rem;
  color: var(--text-color);
  background: rgba(255, 255, 255, 0.05);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}

.log-card-body {
  display: flex;
  gap: var(--space-4);
  align-items: flex-start;
}

.log-book-cover-wrap {
  width: 105px;
  min-width: 105px;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm);
  position: relative;
  overflow: hidden;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.12);
  background-color: var(--input-bg);
}

.log-cover-real-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.log-content-meta {
  flex: 1;
  min-width: 0;
}

.log-book-details {
  margin-bottom: var(--space-2);
}

.log-title-serif {
  font-family: var(--font-serif);
  font-size: 1.2rem;
  font-weight: 700;
  color: #fff;
  display: block;
  line-height: var(--line-height-tight);
}

.log-author-sub {
  font-size: var(--font-size-xs);
  color: var(--text-color);
  display: block;
  margin-top: 2px;
}

.log-quote-text {
  font-family: var(--font-serif);
  font-size: 0.88rem;
  color: #c9d1d9;
  line-height: var(--line-height-relaxed);
  font-style: italic;
  margin: 0 0 var(--space-3) 0;
  border-left: 2px solid var(--highlight);
  padding-left: var(--space-3);
}

.log-tags-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.log-tag {
  font-size: 0.7rem;
  background-color: var(--input-bg);
  color: var(--text-color);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-weight: 500;
}

.log-tag-highlight {
  background-color: rgba(245, 158, 11, 0.12);
  color: var(--highlight);
  font-weight: 600;
}

.hero-floating-pill {
  position: absolute;
  bottom: -18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3;
  background: #1c2229;
  border: 1px solid rgba(245, 158, 11, 0.35);
  padding: 5px 14px;
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
}

.floating-pill-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background-color: var(--highlight);
}

@media (max-width: 960px) {
  .hero-layout {
    grid-template-columns: 1fr;
    gap: var(--space-8);
  }

  .hero-visual-stage {
    margin: 0 auto;
    max-width: 440px;
  }
}

@media (max-width: 640px) {
  .landing-hero {
    padding: var(--space-4) 0 var(--space-8) 0;
  }

  .fan-book {
    display: none;
  }

  .hero-log-card {
    padding: var(--space-4);
  }

  .log-card-body {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .log-quote-text {
    border-left: none;
    border-top: 2px solid var(--highlight);
    padding-left: 0;
    padding-top: var(--space-2);
  }

  .log-tags-row {
    justify-content: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .btn-hero {
    transition: none;
    transform: none !important;
  }

  .btn-hero:hover .btn-arrow-icon {
    transform: none !important;
  }
}
</style>
