<template>
  <section class="landing-more" aria-labelledby="more-heading">
    <h2 id="more-heading" class="more-heading">
      Depois do registro, a estante.
    </h2>

    <dl class="more-list">
      <div class="more-row">
        <dt class="more-term">
          Leitura em andamento
        </dt>
        <dd class="more-desc">
          Marque as páginas que leu em cada dia. A porcentagem aparece na sua página inicial.
        </dd>
      </div>

      <div class="more-row">
        <dt class="more-term">
          Estante e diário
        </dt>
        <dd class="more-desc">
          Capas em grade, com filtro por gênero, país e década. Ou o diário, organizado por mês.
        </dd>
      </div>

      <div class="more-row">
        <dt class="more-term">
          Mapa e estatísticas
        </dt>
        <dd class="more-desc">
          O mapa colore os países de origem dos livros que você leu, e tocar num país filtra a estante. As estatísticas mostram o total e cada ano.
        </dd>
      </div>

      <div class="more-row">
        <dt class="more-term">
          Atividade do grupo
        </dt>
        <dd class="more-desc">
          Os registros públicos dos membros, do mais recente para o mais antigo. Sem anúncio e sem recomendação automática.
        </dd>
      </div>

      <div class="more-row">
        <dt class="more-term">
          Seus dados
        </dt>
        <dd class="more-desc">
          Exporte a biblioteca inteira em JSON quando quiser.
        </dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.landing-more {
  width: 100%;
}

.more-heading {
  margin: 0 0 var(--space-6);
  font-family: var(--font-serif);
  font-size: var(--font-size-2xl);
  font-weight: 600;
  font-style: normal;
  line-height: var(--line-height-tight);
  letter-spacing: -0.015em;
  color: var(--poster-border);
  text-wrap: balance;
}

.more-list {
  margin: 0;
  border-bottom: 1px solid var(--input-bg);
}

.more-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-1);
  padding: var(--space-4) 0;
  border-top: 1px solid var(--input-bg);
}

.more-term {
  font-family: var(--font-serif);
  font-size: var(--font-size-lg);
  font-weight: 600;
  line-height: var(--line-height-tight);
  color: var(--poster-border);
}

.more-desc {
  max-width: 36rem;
  margin: 0;
  font-size: var(--font-size-base);
  line-height: var(--line-height-relaxed);
  color: var(--text-color);
}

@media (min-width: 900px) {
  .more-heading {
    margin-bottom: var(--space-8);
    font-size: var(--font-size-3xl);
  }

  .more-row {
    grid-template-columns: minmax(0, 15rem) minmax(0, 1fr);
    gap: var(--space-8);
    padding: var(--space-5) 0;
  }
}
</style>
