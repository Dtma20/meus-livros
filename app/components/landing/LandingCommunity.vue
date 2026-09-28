<template>
  <section class="landing-community" aria-labelledby="community-heading">
    <div class="section-center-heading">
      <span class="section-eyebrow">FRASES DO ACERVO</span>
      <h2 id="community-heading" class="section-title-display">
        Palavras que ficam na memória
      </h2>
      <p class="section-desc-center">
        Passagens e aberturas marcantes das obras que compartilhamos e discutimos em nossos encontros literários.
      </p>
    </div>

    <div class="community-cards-grid">
      <article class="community-log-card">
        <div class="community-poster-col">
          <div class="showcase-cover">
            <img
              src="https://m.media-amazon.com/images/I/810Vj9zyi-L._AC_UF1000,1000_QL80_.jpg"
              alt="Capa do livro A Hora da Estrela, de Clarice Lispector"
              class="poster-img"
              loading="lazy"
            >
            <div class="book-spine-shine" />
          </div>
        </div>

        <div class="community-body-col">
          <div class="community-book-header">
            <h3 class="community-work-title">A Hora da Estrela</h3>
            <p class="community-work-author">Clarice Lispector · 1977</p>
          </div>

          <blockquote class="community-book-quote">
            “Tudo no mundo começou com um sim. Uma molécula disse sim a outra molécula e nasceu a vida. Mas antes da pré-história havia a pré-história da pré-história e havia o nunca e havia o sim.”
          </blockquote>

          <div class="community-footer-tags">
            <span class="community-tag">Literatura Brasileira</span>
            <span class="community-tag community-tag-highlight">Abertura</span>
          </div>
        </div>
      </article>

      <article class="community-log-card">
        <div class="community-poster-col">
          <div class="showcase-cover">
            <img
              src="https://m.media-amazon.com/images/I/61EVp+EGGXL._AC_UF1000,1000_QL80_.jpg"
              alt="Capa do livro Dom Casmurro, de Machado de Assis"
              class="poster-img"
              loading="lazy"
            >
            <div class="book-spine-shine" />
          </div>
        </div>

        <div class="community-body-col">
          <div class="community-book-header">
            <h3 class="community-work-title">Dom Casmurro</h3>
            <p class="community-work-author">Machado de Assis · 1899</p>
          </div>

          <blockquote class="community-book-quote">
            “Olhos de ressaca? Vá, de ressaca. É o que me dá ideia daquela feição nova. Traziam não sei que fluido misterioso e enérgico, uma força que arrastava para dentro, como a vaga que se retira da praia nos dias de ressaca.”
          </blockquote>

          <div class="community-footer-tags">
            <span class="community-tag">Realismo Brasileiro</span>
            <span class="community-tag community-tag-highlight">Cap. XXXII</span>
          </div>
        </div>
      </article>

      <article class="community-log-card">
        <div class="community-poster-col">
          <div class="showcase-cover">
            <img
              src="https://leiturasparalelas.wordpress.com/wp-content/uploads/2014/09/capa.jpg"
              alt="Capa do livro Ensaio sobre a Cegueira, de José Saramago"
              class="poster-img"
              loading="lazy"
            >
            <div class="book-spine-shine" />
          </div>
        </div>

        <div class="community-body-col">
          <div class="community-book-header">
            <h3 class="community-work-title">Ensaio sobre a Cegueira</h3>
            <p class="community-work-author">José Saramago · 1995</p>
          </div>

          <blockquote class="community-book-quote">
            “Se podes olhar, vê. Se podes ver, repara.”
          </blockquote>

          <div class="community-footer-tags">
            <span class="community-tag">Ficção em Português</span>
            <span class="community-tag community-tag-highlight">Epígrafe</span>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.landing-community {
  width: 100%;
}

.section-center-heading {
  text-align: center;
  max-width: 680px;
  margin: 0 auto var(--space-10) auto;
}

.section-eyebrow {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--highlight);
  font-weight: 700;
  display: block;
  margin-bottom: var(--space-2);
}

.section-title-display {
  font-family: var(--font-serif);
  font-size: clamp(1.7rem, 3vw, 2.3rem);
  font-weight: 600;
  color: #fff;
  line-height: 1.25;
  margin: 0 0 var(--space-3) 0;
  letter-spacing: -0.015em;
}

.section-desc-center {
  font-size: 0.98rem;
  color: var(--text-color);
  line-height: var(--line-height-relaxed);
  margin: 0;
}

.community-cards-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-5);
}

.community-log-card {
  display: flex;
  flex-direction: column;
  background-color: var(--card-bg);
  border: 1px solid var(--input-bg);
  border-radius: var(--radius-md);
  padding: var(--space-5);
  transition: border-color 0.25s, transform 0.25s;
}

.community-log-card:hover {
  border-color: rgba(245, 158, 11, 0.45);
  transform: translateY(-3px);
}

.community-poster-col {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-bottom: var(--space-4);
}

.showcase-cover {
  width: 100%;
  max-width: 140px;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm);
  position: relative;
  overflow: hidden;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.1);
  background-color: var(--input-bg);
}

.poster-img {
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

.community-body-col {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.community-book-header {
  margin-bottom: var(--space-3);
}

.community-work-title {
  font-family: var(--font-serif);
  font-size: 1.15rem;
  font-weight: 600;
  color: #fff;
  margin: 0;
  line-height: var(--line-height-tight);
}

.community-work-author {
  font-size: var(--font-size-xs);
  color: var(--text-color);
  margin: 4px 0 0 0;
}

.community-book-quote {
  font-family: var(--font-serif);
  font-size: 0.95rem;
  color: #e2e8f0;
  line-height: var(--line-height-relaxed);
  font-style: italic;
  margin: 0 0 var(--space-4) 0;
  flex: 1;
  border-left: 2px solid var(--highlight);
  padding-left: var(--space-3);
}

.community-footer-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: auto;
}

.community-tag {
  font-size: 0.68rem;
  background-color: var(--input-bg);
  color: var(--text-color);
  padding: 2px 7px;
  border-radius: var(--radius-sm);
  font-weight: 500;
}

.community-tag-highlight {
  background-color: rgba(245, 158, 11, 0.12);
  color: var(--highlight);
  font-weight: 600;
}

@media (max-width: 960px) {
  .community-cards-grid {
    grid-template-columns: 1fr;
    max-width: 480px;
    margin: 0 auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .community-log-card {
    transition: none;
    transform: none !important;
  }
}
</style>
