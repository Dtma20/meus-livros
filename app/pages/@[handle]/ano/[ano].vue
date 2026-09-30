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
        <NuxtLink :to="`/@${stats.user.handle}/estatisticas`" class="back-link">
          ← Voltar para estatísticas de @{{ stats.user.handle }}
        </NuxtLink>
        <h1 class="stats-heading">
          {{ stats.user.display_name }} em {{ anoNumber }}
        </h1>
      </header>

      <section v-if="stats.years.length > 0" class="year-switcher-section">
        <nav aria-label="Outros anos" class="year-switcher">
          <NuxtLink
            v-for="y in stats.years"
            :key="y"
            :to="`/@${stats.user.handle}/ano/${y}`"
            class="year-switcher-link"
            :class="{ active: y === anoNumber }"
            :aria-current="y === anoNumber ? 'page' : undefined"
          >
            {{ y }}
          </NuxtLink>
          <NuxtLink
            :to="`/@${stats.user.handle}/estatisticas`"
            class="year-switcher-link all-years-link"
          >
            Todos os anos
          </NuxtLink>
        </nav>
      </section>

      <div v-if="stats.totals.books === 0" class="empty-state-wrapper">
        <EmptyState
          :title="`Nenhuma leitura registrada em ${anoNumber}.`"
        />
      </div>

      <div v-else class="stats-body">
        <section class="stat-tiles" aria-label="Totais de leitura do ano">
          <StatBox :value="formattedBooks" label="Livros lidos" />
          <StatBox :value="formattedPages" label="Páginas" />
          <StatBox :value="formattedAuthors" label="Autores" />
          <StatBox :value="formattedCountries" label="Países" />
          <StatBox :value="formattedRating" label="Nota média" />
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
          <RatingHistogram :ratings="flatRatings" />
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
const rawAno = computed(() => {
  const param = route.params.ano
  return (Array.isArray(param) ? param[0] : param) ?? ''
})

const requestFetch = useRequestFetch()
const reqUrl = typeof useRequestURL === 'function' ? useRequestURL() : null
const event = import.meta.server && typeof useRequestEvent === 'function' ? useRequestEvent() : null

const isInteger = computed(() => /^-?\d+$/.test(rawAno.value))

if (!isInteger.value) {
  if (event) {
    setResponseStatus(event, 404)
  }
  showError({ statusCode: 404 })
}

const anoNumber = computed(() => (isInteger.value ? Number(rawAno.value) : 0))

const session = typeof useState === 'function'
  ? useState<{ user?: AuthSessionUser | null }>('auth:session', () => ({ user: null }))
  : ref({ user: null })

const { data: pageData, pending, error, refresh } = await useAsyncData(
  () => `stats-${handle.value}-${rawAno.value}`,
  async () => {
    if (!isInteger.value) return null

    const [statsRes, meRes] = await Promise.allSettled([
      requestFetch<StatsResponse>(`/api/users/${encodeURIComponent(handle.value)}/stats?ano=${encodeURIComponent(rawAno.value)}`),
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

const headingTitle = computed(() => {
  if (!stats.value) return 'Estatísticas'
  return `${stats.value.user.display_name} em ${anoNumber.value}`
})

const seoDescription = computed(() => {
  if (!stats.value) return ''
  const name = stats.value.user.display_name
  const booksCount = stats.value.totals.books
  const booksText = `${formatThousands(booksCount)} ${booksCount === 1 ? 'livro' : 'livros'}`
  return `${name} leu ${booksText} em ${anoNumber.value}.`
})

useSeoMeta({
  title: () => headingTitle.value,
  ogTitle: () => headingTitle.value,
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
  margin-bottom: var(--space-6);
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

.year-switcher-section {
  margin-bottom: var(--space-8);
}

.year-switcher {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1);
  background-color: var(--card-bg);
  border-radius: var(--radius-md);
  border: 1px solid var(--input-bg);
  width: fit-content;
  max-width: 100%;
  box-sizing: border-box;
}

.year-switcher-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color);
  text-decoration: none;
  font-size: var(--font-size-sm);
  font-weight: 500;
  padding: var(--space-1) var(--space-3);
  min-height: var(--target-min-size);
  border-radius: var(--radius-sm);
  transition: color 0.2s, background-color 0.2s;
  box-sizing: border-box;
}

.year-switcher-link:hover:not(.active) {
  color: var(--poster-border);
}

.year-switcher-link.active {
  background-color: var(--highlight);
  color: var(--bg-color);
  font-weight: 700;
}

.year-switcher-link:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
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
}

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
</style>
