<template>
  <section class="landing-entry" aria-labelledby="entry-heading">
    <h2 id="entry-heading" class="entry-heading">
      Um livro, uma página.
    </h2>
    <p class="entry-intro">
      Este é um registro real do acervo com que o site começou: Dom Casmurro, lido em 2022.
    </p>

    <div class="entry-layout">
      <article class="entry" aria-labelledby="entry-book-title">
        <header class="entry-header">
          <h3 id="entry-book-title" class="entry-book-title">
            Dom Casmurro
          </h3>
          <p class="entry-book-meta">
            Machado de Assis · 1899 · 276 páginas
          </p>
          <p class="entry-read">
            <span class="entry-stars" role="img" aria-label="4 de 5 estrelas">★★★★</span>
            <span>Lido em 2022</span>
          </p>
        </header>

        <div class="entry-review">
          <p>
            Ao falar de Dom Casmurro, boa parte das pessoas apenas lembram da pergunta “Capitu traiu ou não”, porém ao ler, dá pra notar que o livro é bem mais do que isso, tem toda uma história do romance entre os personagens, a dificuldade que foi deles conseguirem se relacionar até chegar a grandes tragédias do livro e tudo mais.
          </p>
          <p>
            Machado de Assis, apesar de usar um vocabulário rebuscado e até meio difícil (o que era esperado, devido a data de publicação do livro), consegue tornar a leitura intuitiva conversando com o leitor e usando diversas referências da literatura mundial.
          </p>
          <p>
            A história possui seus momentos de altos e baixos, mas ainda sim não se resume apenas à traição ou não traição de Capitu.
          </p>
        </div>
      </article>

      <ul class="entry-notes" aria-label="O que cada parte do registro guarda">
        <li>
          <strong>Nota.</strong>
          De 0,5 a 5, de meia em meia estrela.
        </li>
        <li>
          <strong>Data.</strong>
          Dia, mês ou só o ano: o que você lembrar.
        </li>
        <li>
          <strong>Resenha.</strong>
          Texto simples, sem formatação. É opcional.
        </li>
        <li>
          <strong>Visibilidade.</strong>
          Cada registro é público ou privado. O privado só você vê.
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.landing-entry {
  width: 100%;
}

.entry-heading {
  margin: 0 0 var(--space-3);
  font-family: var(--font-serif);
  font-size: var(--font-size-2xl);
  font-weight: 600;
  font-style: normal;
  line-height: var(--line-height-tight);
  letter-spacing: -0.015em;
  color: var(--poster-border);
  text-wrap: balance;
}

.entry-intro {
  max-width: 34rem;
  margin: 0 0 var(--space-8);
  font-size: var(--font-size-base);
  line-height: var(--line-height-relaxed);
  color: var(--text-color);
}

.entry-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-6);
}

.entry {
  min-width: 0;
  padding: var(--space-4);
  background-color: var(--card-bg);
  border: 1px solid var(--input-bg);
  border-radius: var(--radius-md);
}

.entry-header {
  margin-bottom: var(--space-5);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--input-bg);
}

.entry-book-title {
  margin: 0;
  font-family: var(--font-serif);
  font-size: var(--font-size-xl);
  font-weight: 600;
  line-height: var(--line-height-tight);
  color: var(--poster-border);
}

.entry-book-meta {
  margin: var(--space-1) 0 var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--text-color);
}

.entry-read {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-3);
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-bright);
}

.entry-stars {
  color: var(--star-color);
  letter-spacing: 1px;
}

.entry-review {
  max-width: 62ch;
}

.entry-review p {
  margin: 0 0 var(--space-4);
  font-size: var(--font-size-base);
  line-height: 1.65;
  color: var(--text-bright);
}

.entry-review p:last-child {
  margin-bottom: 0;
}

.entry-notes {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
  color: var(--text-color);
}

.entry-notes li {
  padding: var(--space-3) 0;
  border-top: 1px solid var(--input-bg);
}

.entry-notes strong {
  margin-right: var(--space-1);
  font-weight: 600;
  color: var(--text-bright);
}

@media (min-width: 600px) {
  .entry {
    padding: var(--space-8);
  }
}

@media (min-width: 900px) {
  .entry-heading {
    font-size: var(--font-size-3xl);
  }

  .entry-layout {
    grid-template-columns: minmax(0, 44rem) minmax(0, 17rem);
    gap: var(--space-12);
    align-items: start;
  }

  .entry-notes li:first-child {
    padding-top: 0;
    border-top: 0;
  }
}
</style>
