<template>
  <section class="landing-hero" aria-labelledby="hero-title">
    <div class="hero-text">
      <h1 id="hero-title" class="hero-title">
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

    <figure class="hero-shelf">
      <ul class="shelf" aria-hidden="true">
        <li
          v-for="spine in spines"
          :key="spine.title"
          class="spine"
          :class="`spine-tone-${spine.tone}`"
          :style="spine.style"
        >
          <span class="spine-title">{{ spine.title }}</span>
        </li>
      </ul>
      <figcaption class="shelf-caption">
        Da estante de quem começou este site. A altura e a espessura de cada lombada seguem o número de páginas.
      </figcaption>
    </figure>
  </section>
</template>

<script setup lang="ts">
// Lombadas desenhadas em CSS. Títulos e páginas vêm do acervo original do site
// (legacy/livros.json), na ordem em que foram lidos. Nada é buscado de fora.
// tone: 1 = card-bg, 2 = input-bg, 3 = text-color, 4 = highlight (o livro do registro mostrado logo abaixo).
const books = [
  { title: 'O meu pé de laranja lima', pages: 192, tone: 2 },
  { title: '1984', pages: 440, tone: 3 },
  { title: 'Dom Casmurro', pages: 276, tone: 4 },
  { title: 'A metamorfose', pages: 98, tone: 1 },
  { title: 'O alienista', pages: 48, tone: 3 },
  { title: 'Ensaio sobre a cegueira', pages: 423, tone: 2 },
  { title: 'O processo', pages: 224, tone: 1 },
  { title: 'A hora da estrela', pages: 88, tone: 3 },
  { title: 'A morte de Ivan Ilitch', pages: 312, tone: 1 },
  { title: 'Frankenstein', pages: 230, tone: 2 },
  { title: 'Cem anos de solidão', pages: 448, tone: 3 },
  { title: 'O estrangeiro', pages: 122, tone: 1 },
]

const spines = books.map((book) => ({
  title: book.title,
  tone: book.tone,
  style: `--h: ${Math.round(112 + book.pages * 0.4)}; --w: ${Math.round(18 + book.pages / 28)}`,
}))
</script>

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
  max-width: 34rem;
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

.hero-shelf {
  --k: 1;
  margin: 0;
  min-width: 0;
}

.shelf {
  display: flex;
  align-items: flex-end;
  gap: var(--space-1);
  margin: 0;
  padding: 0 var(--space-2);
  list-style: none;
  border-bottom: var(--space-1) solid var(--input-bg);
}

.spine {
  position: relative;
  display: flex;
  flex: 0 1 auto;
  align-items: center;
  justify-content: flex-start;
  box-sizing: border-box;
  min-width: 0;
  width: calc(var(--w) * var(--k) * 1px);
  height: calc(var(--h) * 1px);
  padding: var(--space-4) 0 var(--space-3);
  overflow: hidden;
  writing-mode: vertical-rl;
  border-radius: 2px 2px 0 0;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--poster-border) 8%, transparent);
}

.spine::before {
  content: '';
  position: absolute;
  top: var(--space-2);
  left: 20%;
  right: 20%;
  height: 2px;
  background-color: currentColor;
  opacity: 0.35;
}

.spine-title {
  overflow: hidden;
  font-family: var(--font-serif);
  font-size: var(--font-size-xs);
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.spine-tone-1 {
  background-color: var(--card-bg);
  color: var(--text-bright);
}

.spine-tone-2 {
  background-color: var(--input-bg);
  color: var(--text-bright);
}

.spine-tone-3 {
  background-color: var(--text-color);
  color: var(--bg-color);
}

.spine-tone-4 {
  background-color: var(--highlight);
  color: var(--bg-color);
}

.shelf-caption {
  max-width: 28rem;
  margin-top: var(--space-3);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-normal);
  color: var(--text-color);
}

@media (min-width: 900px) {
  .landing-hero {
    grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
    gap: var(--space-12);
    align-items: end;
    padding: var(--space-8) 0 var(--space-12);
  }

  .hero-shelf {
    --k: 1.2;
  }

}

@media (prefers-reduced-motion: reduce) {
  .hero-cta:active {
    transform: none;
  }
}
</style>
