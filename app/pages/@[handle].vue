<template>
  <div class="profile-page">
    <div v-if="pending" class="loading-state">
      <p>Carregando perfil…</p>
    </div>

    <div v-else-if="error || !profile" class="error-state">
      <EmptyState
        icon="🔍"
        title="Perfil não encontrado"
        :message="`O perfil @${handle} não foi encontrado ou é privado.`"
        action-label="Voltar ao início"
        action-href="/"
      />
    </div>

    <div v-else class="profile-content">
      <header class="profile-header">
        <h1 class="display-name">{{ profile.user.display_name }}</h1>
        <div class="handle">@{{ profile.user.handle }}</div>
        <p v-if="profile.user.bio" class="bio">{{ profile.user.bio }}</p>

        <!-- Global stats: always reflect total visible collection -->
        <div class="stats" aria-label="Estatísticas gerais do acervo">
          <StatBox :value="globalStats.totalBooks" label="Livros" />
          <StatBox :value="globalStats.uniqueAuthors" label="Autores" />
          <StatBox :value="globalStats.uniqueCountries" label="Países" />
        </div>
      </header>

      <!-- Empty state when profile has no books registered -->
      <div v-if="logs.length === 0" class="empty-collection">
        <EmptyState
          icon="📚"
          title="Ainda não registrou nenhum livro."
          message="Assim que registrar seus primeiros livros, eles aparecerão aqui."
        />
      </div>

      <template v-else>
        <!-- Filter bar for genre, country, decade, and sorting -->
        <FilterBar
          v-model:genre="filterGenre"
          v-model:country="filterCountry"
          v-model:decade="filterDecade"
          v-model:sort-by="sortBy"
          :available-genres="availableGenres"
          :available-countries="availableCountries"
          :available-decades="availableDecades"
          :has-active-filters="hasActiveFilters"
          @reset="resetFilters"
        />

        <!-- Empty state when active filters match zero books -->
        <div v-if="hasActiveFilters && sortedBooks.length === 0" class="empty-filter-results">
          <EmptyState
            icon="🔍"
            title="Nenhum livro encontrado"
            :message="`Nenhum livro corresponde aos filtros selecionados: ${activeFiltersDescription}.`"
            action-label="Limpar filtros"
            @action="resetFilters"
          />
        </div>

        <!-- Poster grid of books -->
        <BookGrid v-else>
          <div v-for="log in sortedBooks" :key="log.id" class="book-card-item">
            <span
              v-if="log.visibility === 'privado'"
              class="private-badge"
              title="Registro privado — visível apenas para você"
            >
              Privado
            </span>
            <BookCard
              :title="log.work.title"
              :author="formatAuthors(log.work.authors)"
              :rating="log.rating"
              :cover-url="log.work.cover_url || log.edition?.cover_url"
              :ol-cover-id="log.edition?.ol_cover_id"
              :isbn13="log.edition?.isbn13"
              :href="`/entrada/${log.id}`"
            />
          </div>
        </BookGrid>

        <!-- Footer: Paginometer following active filters -->
        <footer class="paginometer" aria-label="Estatísticas de páginas dos livros exibidos">
          <div class="page-stat">
            <strong>{{ filteredStats.totalPages.toLocaleString('pt-BR') }}</strong>
            <span class="page-stat-label">
              Páginas Lidas
              <small v-if="hasActiveFilters" class="filter-indicator">(filtros ativos)</small>
              <small v-else class="filter-indicator">(total)</small>
            </span>
          </div>
          <div class="page-stat">
            <strong>{{ filteredStats.averagePages }}</strong>
            <span class="page-stat-label">
              Média p/ Livro
              <small v-if="hasActiveFilters" class="filter-indicator">(filtros ativos)</small>
              <small v-else class="filter-indicator">(total)</small>
            </span>
          </div>
        </footer>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import BookCard from '~/components/book/BookCard.vue'
import BookGrid from '~/components/book/BookGrid.vue'
import FilterBar from '~/components/profile/FilterBar.vue'
import StatBox from '~/components/profile/StatBox.vue'
import EmptyState from '~/components/ui/EmptyState.vue'
import { useBookFilters } from '~/composables/useBookFilters'
import type { ProfileResponse } from '~~/shared/schemas/profile'

const route = useRoute()
const handle = computed(() => (route.params.handle as string) || '')

const requestFetch = useRequestFetch()

// Awaited on purpose. Without it `error.value` is still null when the check
// below runs, so the 404 never gets set and an unknown or private handle
// answers 200 with an error box — which is the difference between "this profile
// does not exist" and "it exists and you cannot see it".
const { data: profile, pending, error } = await useAsyncData<ProfileResponse>(
  `profile-${handle.value}`,
  () => requestFetch<ProfileResponse>(`/api/users/${handle.value}` as string),
)

// In SSR, return 404 HTTP status if profile is not found or error occurred
if (import.meta.server) {
  const event = useRequestEvent()
  if (event && (error.value || (!pending.value && !profile.value))) {
    setResponseStatus(event, 404)
  }
}

// Open Graph / SEO metadata
const reqUrl = useRequestURL()

const firstCover = computed(() => {
  const items = profile.value?.logs || []
  for (const l of items) {
    const url = l.work.cover_url || l.edition?.cover_url
    if (url) {
      return url.startsWith('http') ? url : `${reqUrl.origin}${url}`
    }
  }
  return `${reqUrl.origin}/favicon.ico`
})

useSeoMeta({
  title: () =>
    profile.value
      ? `${profile.value.user.display_name} (@${profile.value.user.handle}) — Meus Livros`
      : 'Perfil — Meus Livros',
  ogTitle: () =>
    profile.value
      ? `${profile.value.user.display_name} (@${profile.value.user.handle})`
      : 'Perfil',
  description: () =>
    profile.value?.user.bio ||
    (profile.value
      ? `Biblioteca de leituras de ${profile.value.user.display_name}. ${profile.value.stats.totalBooks} livros registrados.`
      : ''),
  ogDescription: () =>
    profile.value?.user.bio ||
    (profile.value
      ? `Biblioteca de leituras de ${profile.value.user.display_name}. ${profile.value.stats.totalBooks} livros registrados.`
      : ''),
  ogUrl: () => reqUrl.href,
  ogType: 'profile',
  ogImage: () => firstCover.value,
  twitterCard: 'summary_large_image',
  twitterTitle: () =>
    profile.value
      ? `${profile.value.user.display_name} (@${profile.value.user.handle})`
      : 'Perfil',
  twitterDescription: () =>
    profile.value?.user.bio ||
    (profile.value
      ? `Biblioteca de leituras de ${profile.value.user.display_name}. ${profile.value.stats.totalBooks} livros registrados.`
      : ''),
  twitterImage: () => firstCover.value,
})

const logs = computed(() => profile.value?.logs || [])

const {
  filterGenre,
  filterCountry,
  filterDecade,
  sortBy,
  availableGenres,
  availableCountries,
  availableDecades,
  hasActiveFilters,
  resetFilters,
  sortedBooks,
  globalStats,
  filteredStats,
} = useBookFilters(logs)

const activeFiltersDescription = computed(() => {
  const parts: string[] = []
  if (filterGenre.value) parts.push(`gênero "${filterGenre.value}"`)
  if (filterCountry.value) parts.push(`país "${filterCountry.value}"`)
  if (filterDecade.value !== '' && filterDecade.value !== null && filterDecade.value !== undefined) {
    parts.push(`década "Anos ${filterDecade.value}"`)
  }
  return parts.join(', ')
})

function formatAuthors(authorsList?: Array<{ name: string }>): string {
  if (!authorsList || authorsList.length === 0) return ''
  return authorsList.map((a) => a.name).join(', ')
}
</script>

<style scoped>
.profile-page {
  width: 100%;
}

.profile-header {
  text-align: center;
  margin-bottom: var(--space-8, 32px);
}

.display-name {
  font-size: var(--font-size-3xl, 2rem);
  font-weight: 700;
  margin: 0 0 var(--space-1, 4px) 0;
  color: #fff;
  line-height: var(--line-height-tight, 1.2);
}

.handle {
  color: var(--highlight, #40bcf4);
  font-size: var(--font-size-base, 1rem);
  margin-bottom: var(--space-3, 12px);
}

.bio {
  color: var(--text-color, #9ab);
  font-size: var(--font-size-base, 1rem);
  max-width: 600px;
  margin: 0 auto var(--space-6, 24px) auto;
  line-height: var(--line-height-relaxed, 1.6);
  white-space: pre-wrap;
}

.stats {
  display: flex;
  justify-content: center;
  gap: var(--space-8, 32px);
  margin-top: var(--space-5, 20px);
  margin-bottom: var(--space-6, 24px);
}

.book-card-item {
  position: relative;
}

.private-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
  background-color: rgba(0, 0, 0, 0.85);
  color: var(--highlight, #40bcf4);
  border: 1px solid var(--highlight, #40bcf4);
  font-size: var(--font-size-xs, 0.75rem);
  padding: 2px 6px;
  border-radius: var(--radius-sm, 4px);
  font-weight: 600;
  pointer-events: none;
}

.paginometer {
  margin-top: var(--space-12, 48px);
  padding-top: var(--space-5, 20px);
  border-top: 1px solid var(--input-bg, #2c3440);
  display: flex;
  justify-content: center;
  gap: var(--space-10, 40px);
  color: var(--text-color, #9ab);
}

.page-stat {
  text-align: center;
}

.page-stat strong {
  display: block;
  font-size: var(--font-size-xl, 1.25rem);
  color: #fff;
  line-height: var(--line-height-tight, 1.2);
}

.page-stat-label {
  font-size: var(--font-size-sm, 0.875rem);
  color: var(--text-color, #9ab);
}

.filter-indicator {
  display: block;
  font-size: var(--font-size-xs, 0.75rem);
  color: var(--highlight, #40bcf4);
  margin-top: 2px;
}

.loading-state,
.error-state {
  padding: var(--space-12, 48px) var(--space-4, 16px);
  text-align: center;
}

@media (max-width: 600px) {
  .stats {
    gap: var(--space-5, 20px);
  }
  .paginometer {
    gap: var(--space-5, 20px);
  }
}
</style>
