<template>
  <div class="stats-page">
    <div v-if="pending" class="loading-state">
      <LoadingSkeleton :count="6" />
    </div>

    <div v-else-if="error || !stats" class="error-state">
      <ErrorState
        title="Algo deu errado. Tente de novo."
        action-label="Tentar de novo"
        @retry="refresh"
      />
    </div>

    <div v-else class="stats-content">
      <header class="stats-header">
        <NuxtLink :to="`/@${stats.user.handle}`" class="back-link">
          ← Voltar para @{{ stats.user.handle }}
        </NuxtLink>
        <h1 class="stats-heading">
          Estatísticas de {{ stats.user.display_name }}
        </h1>
      </header>

      <div v-if="stats.totals.books === 0" class="empty-state-wrapper">
        <EmptyState
          v-if="isOwner"
          title="Registre um livro terminado para ver suas estatísticas."
          action-label="Registrar leitura"
          action-href="/app/novo"
        />
        <EmptyState
          v-else
          title="Nenhuma leitura pública ainda."
        />
      </div>

      <div v-else class="stats-body">
        <p class="stats-scope">Contando só as leituras terminadas. Livros em andamento entram quando a leitura termina.</p>
        <section class="stat-tiles" aria-label="Totais de leitura">
          <StatBox :value="formattedBooks" label="Livros lidos" />
          <StatBox :value="formattedPages" label="Páginas" />
          <StatBox :value="formattedAuthors" label="Autores" />
          <StatBox :value="formattedCountries" label="Países" />
          <StatBox :value="formattedRating" label="Nota média" />
        </section>

        <section v-if="stats.byYear.length > 0" class="stats-section">
          <YearColumns
            :items="stats.byYear"
            title="Livros por ano"
            :base-path="`/@${stats.user.handle}`"
          />
        </section>

        <div class="stats-grid-lists">
          <section v-if="stats.genres.length > 0" class="stats-section">
            <BarList :items="stats.genres" title="Gêneros" />
          </section>

          <section v-if="authorItems.length > 0" class="stats-section">
            <BarList :items="authorItems" title="Autores" />
          </section>

          <section v-if="stats.countries.length > 0" class="stats-section">
            <BarList :items="stats.countries" title="Países" />
          </section>

          <section v-if="stats.languages.length > 0" class="stats-section">
            <BarList :items="stats.languages" title="Idiomas" />
          </section>
        </div>

        <section v-if="flatRatings.length > 0" class="stats-section rating-section">
          <h2 class="stats-section-title">Avaliações</h2>
          <RatingHistogram :ratings="flatRatings" size="large" />
        </section>

        <section v-if="formatItems.length > 0" class="stats-section">
          <BarList :items="formatItems" title="Formatos" />
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import BarList from '~/components/stats/BarList.vue'
import YearColumns from '~/components/stats/YearColumns.vue'
import RatingHistogram from '~/components/book/RatingHistogram.vue'
import StatBox from '~/components/profile/StatBox.vue'
import EmptyState from '~/components/ui/EmptyState.vue'
import ErrorState from '~/components/ui/ErrorState.vue'
import LoadingSkeleton from '~/components/ui/LoadingSkeleton.vue'
import type { StatsResponse } from '~~/shared/schemas/stats'
import type { AuthSessionUser } from '~/middleware/auth'
import { formatThousands } from '~/utils/number'

definePageMeta({
  middleware: 'home-layout',
})

const route = useRoute()
const handle = computed(() => (route.params.handle as string) || '')

const requestFetch = useRequestFetch()
const reqUrl = typeof useRequestURL === 'function' ? useRequestURL() : null
const event = import.meta.server && typeof useRequestEvent === 'function' ? useRequestEvent() : null

const session = typeof useState === 'function'
  ? useState<{ user?: AuthSessionUser | null }>('auth:session', () => ({ user: null }))
  : ref({ user: null })

const { data: pageData, pending, error, refresh } = await useAsyncData(
  `stats-${handle.value}`,
  async () => {
    const [statsRes, meRes] = await Promise.allSettled([
      requestFetch<StatsResponse>(`/api/users/${encodeURIComponent(handle.value)}/stats`),
      session.value?.user
        ? Promise.resolve(session.value.user)
        : requestFetch<AuthSessionUser | null>('/api/users/me').catch(() => null),
    ])

    if (statsRes.status === 'rejected') {
      throw statsRes.reason
    }

    const stats = statsRes.value
    const currentUser = meRes.status === 'fulfilled' ? meRes.value : null

    return { stats, currentUser }
  },
)

if (error.value) {
  const err = error.value as { statusCode?: number; status?: number }
  const status = err.statusCode || err.status || 500
  if (event) {
    setResponseStatus(event, status)
  }
  if (status === 404) {
    showError({ statusCode: 404 })
  }
}

const stats = computed(() => pageData.value?.stats ?? null)
const currentUser = computed(() => pageData.value?.currentUser ?? session.value?.user ?? null)

const isOwner = computed(() => {
  if (!stats.value?.user || !currentUser.value) return false
  if (currentUser.value.handle && stats.value.user.handle) {
    return currentUser.value.handle.toLowerCase() === stats.value.user.handle.toLowerCase()
  }
  return false
})

function formatRating(num: number): string {
  return (Math.round(num * 10) / 10).toFixed(1).replace('.', ',')
}

const formattedBooks = computed(() => {
  return formatThousands(stats.value?.totals.books ?? 0)
})

const formattedPages = computed(() => {
  return formatThousands(stats.value?.totals.pages ?? 0)
})

const formattedAuthors = computed(() => {
  return formatThousands(stats.value?.totals.authors ?? 0)
})

const formattedCountries = computed(() => {
  return formatThousands(stats.value?.totals.countries ?? 0)
})

const formattedRating = computed(() => {
  const avg = stats.value?.totals.averageRating
  return avg !== null && avg !== undefined ? formatRating(avg) : '–'
})

const authorItems = computed(() => {
  if (!stats.value?.authors) return []
  return stats.value.authors.map((a) => ({
    label: a.label,
    count: a.count,
  }))
})

const flatRatings = computed(() => {
  if (!stats.value?.ratings) return []
  return stats.value.ratings.flatMap((r) => Array(r.count).fill(r.rating))
})

const FORMAT_LABELS: Record<string, string> = {
  fisico: 'Físico',
  ebook: 'E-book',
  audio: 'Audiolivro',
}

const formatItems = computed(() => {
  if (!stats.value?.formats) return []
  return stats.value.formats
    .map((f) => ({
      label: f.format ? (FORMAT_LABELS[f.format] ?? 'Não informado') : 'Não informado',
      count: f.count,
    }))
    .filter((item) => item.count > 0)
})

const seoDescription = computed(() => {
  if (!stats.value) return ''
  const name = stats.value.user.display_name
  const booksCount = stats.value.totals.books
  const pagesCount = stats.value.totals.pages
  const booksText = `${formatThousands(booksCount)} ${booksCount === 1 ? 'livro' : 'livros'}`
  const pagesText = `${formatThousands(pagesCount)} ${pagesCount === 1 ? 'página' : 'páginas'}`
  return `${name} já leu ${booksText} e ${pagesText}.`
})

useSeoMeta({
  title: () => (stats.value ? `Estatísticas de ${stats.value.user.display_name}` : 'Estatísticas'),
  ogTitle: () => (stats.value ? `Estatísticas de ${stats.value.user.display_name}` : 'Estatísticas'),
  description: () => seoDescription.value,
  ogDescription: () => seoDescription.value,
  ogUrl: () => reqUrl?.href ?? '',
  ogType: 'profile',
})
</script>

<style scoped>
.stats-page {
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  box-sizing: border-box;
}

.loading-state,
.error-state {
  text-align: center;
  padding: var(--space-12) var(--space-4);
  color: var(--text-color);
}

.stats-header {
  margin-bottom: var(--space-8);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.back-link {
  color: var(--text-bright);
  text-decoration: underline;
  text-decoration-color: var(--highlight);
  text-decoration-thickness: 2px;
  text-underline-offset: 0.3em;
  font-size: var(--font-size-sm);
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  min-height: var(--target-min-size);
  width: fit-content;
  transition: color 0.2s;
}

.back-link:visited {
  color: var(--text-bright);
}

.back-link:hover {
  color: var(--highlight-hover);
}

.back-link:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
}

.stats-heading {
  font-size: var(--font-size-3xl);
  font-weight: 700;
  margin: 0;
  color: var(--poster-border);
  line-height: var(--line-height-tight);
}

@keyframes statsSectionFadeInUp {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.stat-tiles {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--space-6);
  padding: var(--space-4) 0;
  margin-bottom: var(--space-8);
  border-top: 1px solid var(--input-bg);
  border-bottom: 1px solid var(--input-bg);
}

.stat-tiles > * {
  animation: statsSectionFadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.stat-tiles > :nth-child(1) { animation-delay: 0.02s; }
.stat-tiles > :nth-child(2) { animation-delay: 0.05s; }
.stat-tiles > :nth-child(3) { animation-delay: 0.08s; }
.stat-tiles > :nth-child(4) { animation-delay: 0.11s; }
.stat-tiles > :nth-child(5) { animation-delay: 0.14s; }

/* Two columns on phones; an odd last tile spans both so no row holds one tile at half width. */
@media (max-width: 600px) {
  .stat-tiles {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-4);
  }

  .stat-tiles > :last-child:nth-child(odd) {
    grid-column: 1 / -1;
  }
}

.stats-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.stats-section {
  width: 100%;
  box-sizing: border-box;
  animation: statsSectionFadeInUp 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.stats-body > :nth-child(1) { animation-delay: 0.06s; }
.stats-body > :nth-child(2) { animation-delay: 0.12s; }
.stats-body > :nth-child(3) { animation-delay: 0.18s; }
.stats-body > :nth-child(4) { animation-delay: 0.24s; }

.stats-grid-lists {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-8);
}

@media (max-width: 600px) {
  .stats-grid-lists {
    grid-template-columns: minmax(0, 1fr);
  }
}

.stats-section-title {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--poster-border);
  margin: 0 0 var(--space-3) 0;
  line-height: var(--line-height-tight);
}

.rating-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.empty-state-wrapper {
  margin: var(--space-8) 0;
}

.stats-scope {
  margin: 0 0 var(--space-4);
  font-size: var(--font-size-sm);
  color: var(--text-color);
}

@media (prefers-reduced-motion: reduce) {
  .stat-tiles > *,
  .stats-section {
    animation: none;
  }
}
</style>
