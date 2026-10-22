<template>
  <div class="reading-insights">
    <section class="reading-profile" aria-labelledby="reading-profile-heading">
      <header class="insights-header">
        <h2 id="reading-profile-heading">{{ year === null ? 'Seu perfil de leitura' : `Seu ano em livros · ${year}` }}</h2>
        <p>Cada cálculo considera só as leituras terminadas com o dado correspondente informado. Releituras também contam.</p>
      </header>
      <div class="highlights">
        <div class="highlight paper-panel">
          <h3>Páginas por livro</h3>
          <p class="highlight-value">{{ formatDecimal(insights.pages.average) }}</p>
          <p>Média entre {{ formatThousands(insights.pages.knownBooks) }} leituras com páginas informadas.</p>
        </div>
        <div class="highlight paper-panel">
          <h3>Mediana de páginas</h3>
          <p class="highlight-value">{{ formatDecimal(insights.pages.median) }}</p>
          <p>O tamanho central ao ordenar as leituras por número de páginas.</p>
        </div>
        <div class="highlight paper-panel">
          <h3>Livro mais longo</h3>
          <p class="highlight-value">{{ insights.pages.longest ? `${formatThousands(insights.pages.longest.pages)} pág.` : '–' }}</p>
          <p v-if="insights.pages.longest">
            <NuxtLink :to="`/livro/${insights.pages.longest.slug}`">{{ insights.pages.longest.title }}</NuxtLink>
            <span v-if="insights.pages.longest.authors.length"> · {{ insights.pages.longest.authors.join(', ') }}</span>
          </p>
          <p v-else>Sem páginas informadas.</p>
        </div>
        <template v-if="year !== null && insights.yearReview">
          <div class="highlight paper-panel">
            <h3>Autores novos no ano</h3>
            <p class="highlight-value">{{ formatThousands(insights.yearReview.newAuthors) }}</p>
            <p>Autores sem leituras anteriores neste histórico. Leituras sem ano de conclusão não entram na comparação.</p>
          </div>
          <div class="highlight paper-panel">
            <h3>Melhor nota do ano</h3>
            <p class="highlight-value">{{ insights.yearReview.bestRating === null ? '–' : `${formatDecimal(insights.yearReview.bestRating)} ★` }}</p>
            <ul v-if="insights.yearReview.bestBooks.length" class="best-books">
              <li v-for="book in insights.yearReview.bestBooks" :key="book.slug">
                <NuxtLink :to="`/livro/${book.slug}`">{{ book.title }}</NuxtLink>
              </li>
            </ul>
            <p v-else>Nenhuma avaliação neste ano.</p>
          </div>
          <div class="highlight paper-panel">
            <h3>Leituras em {{ year - 1 }}</h3>
            <p class="highlight-value">{{ formatThousands(insights.yearReview.previousYearBooks) }}</p>
            <p>{{ insights.yearReview.previousYearBooks ? 'Referência do ano anterior completo, considerando as leituras visíveis neste perfil.' : 'Não há leituras do ano anterior neste histórico.' }}</p>
          </div>
        </template>
        <div v-else class="highlight paper-panel">
          <h3>Ano com mais leituras</h3>
          <p class="highlight-value">{{ insights.bestYear?.year ?? '–' }}</p>
          <p v-if="insights.bestYear">
            {{ formatThousands(insights.bestYear.books) }} {{ insights.bestYear.books === 1 ? 'leitura registrada' : 'leituras registradas' }}. Em caso de empate, o primeiro ano.
          </p>
          <p v-else>Sem ano de conclusão informado.</p>
        </div>
      </div>
    </section>

    <div class="breakdowns">
      <section class="breakdown paper-panel">
        <BarList :items="insights.pageRanges" title="Tamanho dos livros" />
        <p>{{ formatThousands(insights.pages.knownBooks) }} leituras com páginas informadas.</p>
      </section>
      <section class="breakdown paper-panel">
        <BarList v-if="insights.publicationPeriods.length" :items="insights.publicationPeriods" title="Épocas de publicação" />
        <h2 v-else>Épocas de publicação</h2>
        <p>{{ insights.publicationPeriods.length ? 'Século da primeira publicação da obra, independentemente da edição lida.' : 'Informe o ano de publicação das obras para ver este recorte.' }}</p>
      </section>
      <section class="breakdown paper-panel">
        <BarList v-if="genreItems.length" :items="genreItems" title="Gêneros mais bem avaliados" :max-value="5" />
        <h2 v-else>Gêneros mais bem avaliados</h2>
        <p>Nota média de 0 a 5, com pelo menos 3 avaliações por gênero. Uma leitura pode participar de vários gêneros.</p>
        <p v-if="!genreItems.length">Ainda não há avaliações suficientes para este recorte.</p>
      </section>
      <section class="breakdown paper-panel">
        <BarList v-if="insights.publishers.length" :items="insights.publishers" title="Editoras mais presentes" />
        <h2 v-else>Editoras mais presentes</h2>
        <p>{{ insights.publishers.length ? 'Até 10 editoras das edições lidas. Sem edição escolhida, usamos a primeira edição cadastrada.' : 'Informe a editora das edições para ver este recorte.' }}</p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ReadingInsights } from '~~/shared/schemas/stats'
import BarList from './BarList.vue'
import { formatThousands } from '~/utils/number'

const props = defineProps<{ insights: ReadingInsights; year: number | null }>()

function formatDecimal(value: number | null): string {
  if (value === null) return '–'
  const [whole, fraction] = value.toFixed(1).split('.')
  return `${formatThousands(Number(whole))}${fraction === '0' ? '' : `,${fraction}`}`
}

const genreItems = computed(() => props.insights.genreRatings.map(row => ({
  label: row.label,
  count: row.averageRating,
  display: `${formatDecimal(row.averageRating)} ★`,
  detail: `${formatThousands(row.count)} avaliações`,
})))
</script>

<style scoped>
.reading-insights,
.reading-profile { display: grid; gap: var(--space-6); min-width: 0; }
.reading-insights { gap: var(--space-8); }
.insights-header h2 { margin: 0; color: var(--paper-white); font-family: var(--font-serif); font-size: var(--font-size-xl); }
.insights-header { border-inline-start: 2px solid var(--crease-color); padding-inline-start: var(--space-3); }
.insights-header p,
.highlight p,
.breakdown p { margin: var(--space-2) 0 0; color: var(--text-color); font-size: var(--font-size-sm); line-height: var(--line-height-relaxed); }
.highlights,
.breakdowns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); margin: 0; }
.highlight,
.breakdown { min-width: 0; padding: var(--space-6); background: var(--card-bg); border-radius: var(--radius-md); overflow-wrap: anywhere; }
.highlight h3 { margin: 0; font-weight: 500; color: var(--text-bright); font-size: var(--font-size-sm); }
.highlight .highlight-value { margin: var(--space-3) 0 0; color: var(--highlight); font-family: var(--font-serif); font-size: var(--font-size-3xl); font-variant-numeric: tabular-nums; line-height: var(--line-height-tight); }
.highlight a { color: var(--paper-white); text-underline-offset: 0.2em; text-decoration-color: var(--crease-color); }
.highlight a:hover { color: var(--highlight); text-decoration-color: currentColor; }
.highlight a:focus-visible { outline: var(--focus-ring-width) solid var(--focus-ring-color); outline-offset: var(--focus-ring-offset); }
.best-books { padding-inline-start: var(--space-4); margin: var(--space-2) 0 0; font-size: var(--font-size-sm); line-height: var(--line-height-relaxed); }
.breakdown h2 { margin: 0; font-size: var(--font-size-base); color: var(--paper-white); }
@media (max-width: 600px) {
  .highlights,
  .breakdowns { grid-template-columns: minmax(0, 1fr); }
  .highlight,
  .breakdown { padding: var(--space-4); }
}
@media (forced-colors: active) {
  .highlight .highlight-value,
  .highlight a { color: CanvasText; }
}
</style>
