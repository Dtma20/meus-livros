<template>
  <div class="profile-page">
    <div v-if="pending" class="loading-state">
      <LoadingSkeleton :count="6" />
    </div>

    <div v-else-if="error || !profile" class="error-state">
      <EmptyState
        v-if="is404"
        heading-tag="h1"
        title="Perfil não encontrado"
        :message="`O perfil @${handle} não foi encontrado ou é privado.`"
        action-label="Voltar ao início"
        action-href="/"
      />
      <ErrorState
        v-else
        heading-tag="h1"
        title="Algo deu errado. Tente de novo."
        action-label="Tentar de novo"
        @retry="refresh"
      />
    </div>

    <div v-else class="profile-content">
      <header class="profile-header">
        <div class="identity">
          <div class="name-row">
            <h1 class="display-name">{{ profile.user.display_name }}</h1>
            <button
              type="button"
              class="handle"
              :title="copied ? 'Link copiado' : 'Copiar link do perfil'"
              @click="copyProfileLink(profile.user.handle)"
            >
              @{{ profile.user.handle }}
            </button>
          </div>
          <p class="copy-feedback" role="status" aria-live="polite">
            {{ copyFeedback }}
          </p>
          <div v-if="isOwner" class="profile-actions">
            <NuxtLink to="/app/perfil" class="btn-edit-profile">
              Editar perfil
            </NuxtLink>
            <a
              href="/api/library/export"
              download="meus-livros-export.json"
              class="btn-edit-profile btn-export-profile"
              title="Exportar biblioteca em JSON"
            >
              Exportar JSON
            </a>
          </div>
        </div>
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
          v-if="isOwner"
          title="Você ainda não registrou nenhum livro."
          message="Assim que registrar seus primeiros livros, eles aparecerão aqui."
          action-label="Registrar livro"
          action-href="/app/novo"
        />
        <EmptyState
          v-else
          title="Ainda não registrou nenhum livro."
          message="Assim que registrar seus primeiros livros, eles aparecerão aqui."
        />
      </div>

      <template v-else>
        <!-- Visibility switcher for owner -->
        <div v-if="isOwner" class="visibility-bar">
          <div class="visibility-nav" role="tablist" aria-label="Filtrar por visibilidade">
            <button
              type="button"
              role="tab"
              :aria-selected="visibilityFilter === 'todos'"
              class="visibility-tab"
              :class="{ active: visibilityFilter === 'todos' }"
              @click="setVisibilityFilter('todos')"
            >
              Todos <span class="tab-count">{{ visibilityCounts.todos }}</span>
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="visibilityFilter === 'publico'"
              class="visibility-tab"
              :class="{ active: visibilityFilter === 'publico' }"
              @click="setVisibilityFilter('publico')"
            >
              Públicos <span class="tab-count">{{ visibilityCounts.publico }}</span>
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="visibilityFilter === 'privado'"
              class="visibility-tab"
              :class="{ active: visibilityFilter === 'privado' }"
              @click="setVisibilityFilter('privado')"
            >
              Privados <span class="tab-count">{{ visibilityCounts.privado }}</span>
            </button>
          </div>
        </div>

        <!-- Empty state when chosen visibility has zero books -->
        <div v-if="displayedLogs.length === 0" class="empty-visibility-results">
          <EmptyState
            v-if="visibilityFilter === 'privado'"
            title="Nenhum livro privado."
            message="Livros marcados como privados ao registrar ou editar aparecerão aqui."
            action-label="Registrar livro"
            action-href="/app/novo"
          />
          <EmptyState
            v-else-if="visibilityFilter === 'publico'"
            title="Nenhum livro público."
            message="Livros marcados como públicos aparecerão aqui para outros leitores."
            action-label="Registrar livro"
            action-href="/app/novo"
          />
        </div>

        <template v-else>
        <!-- Reading map of countries -->
        <ClientOnly>
          <ReadingMap
            v-if="showMap"
            :country-counts="readingMapData.countryCounts"
            :selected-country="filterCountry"
            :unmapped-countries="readingMapData.unmappedCountries"
            @select="filterCountry = $event"
          />
        </ClientOnly>

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
            title="Nenhum livro com esses filtros."
            :message="`Filtros ativos: ${activeFiltersDescription}.`"
            action-label="Limpar filtros"
            @action="resetFilters"
          />
        </div>

        <!-- Poster grid of books and footer (only rendered when books match) -->
        <template v-else>
          <BookGrid>
            <!--
              .book-grid is 6 columns at its widest, so the first 6 are the first row.
              Below 601px the reading map is hidden and card 0 is the LCP element.
            -->
            <div v-for="(log, i) in sortedBooks" :key="log.id" class="book-card-item">
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
                :loading="i < 6 ? 'eager' : 'lazy'"
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
      </template>
    </template>
  </div>
</div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import BookCard from '~/components/book/BookCard.vue'
import BookGrid from '~/components/book/BookGrid.vue'
import FilterBar from '~/components/profile/FilterBar.vue'
import StatBox from '~/components/profile/StatBox.vue'
import EmptyState from '~/components/ui/EmptyState.vue'
import ErrorState from '~/components/ui/ErrorState.vue'
import LoadingSkeleton from '~/components/ui/LoadingSkeleton.vue'
import { useBookFilters } from '~/composables/useBookFilters'
import { aggregateReadingMapData } from '~/utils/reading-map'
import type { ProfileResponse } from '~~/shared/schemas/profile'
import type { AuthSessionUser } from '~/middleware/auth'

const ReadingMap = defineAsyncComponent(() => import('~/components/profile/ReadingMap.vue'))

definePageMeta({
  middleware: 'home-layout',
})

const route = useRoute()
const handle = computed(() => (route.params.handle as string) || '')

const requestFetch = useRequestFetch()
const event = import.meta.server && typeof useRequestEvent === 'function' ? useRequestEvent() : null
const reqUrl = typeof useRequestURL === 'function' ? useRequestURL() : null

const session = typeof useState === 'function'
  ? useState<{ user?: AuthSessionUser | null }>('auth:session', () => ({ user: null }))
  : ref({ user: null })

// Awaited on purpose. Without it `error.value` is still null when the check
// below runs, so the 404 never gets set and an unknown or private handle
// answers 200 with an error box — which is the difference between "this profile
// does not exist" and "it exists and you cannot see it".
const { data: pageData, pending, error, refresh } = await useAsyncData(
  `profile-${handle.value}`,
  async () => {
    const [profileRes, meRes] = await Promise.allSettled([
      requestFetch<ProfileResponse>(`/api/users/${handle.value}` as string),
      session.value?.user
        ? Promise.resolve(session.value.user)
        : requestFetch<AuthSessionUser | null>('/api/users/me').catch(() => null),
    ])

    if (profileRes.status === 'rejected') {
      throw profileRes.reason
    }

    const profile = profileRes.value
    const currentUser = meRes.status === 'fulfilled' ? meRes.value : null

    return { profile, currentUser }
  },
)

const profile = computed(() => pageData.value?.profile ?? null)
const currentUser = computed(() => pageData.value?.currentUser ?? session.value?.user ?? null)

const isOwner = computed(() => {
  if (!profile.value?.user || !currentUser.value) return false
  if (currentUser.value.id && profile.value.user.id) {
    return currentUser.value.id === profile.value.user.id
  }
  if (currentUser.value.handle && profile.value.user.handle) {
    return currentUser.value.handle.toLowerCase() === profile.value.user.handle.toLowerCase()
  }
  return false
})

const is404 = computed(() => {
  const err = error.value as { statusCode?: number; status?: number } | null | undefined
  const status = err?.statusCode || err?.status
  return status === 404
})

// In SSR, set HTTP response status if fetch failed
if (event && error.value) {
  const err = error.value as { statusCode?: number; status?: number } | null | undefined
  const status = err?.statusCode || err?.status || 500
  setResponseStatus(event, status)
}

// Open Graph / SEO metadata
const firstCover = computed(() => {
  const items = profile.value?.logs || []
  for (const l of items) {
    const url = l.work.cover_url || l.edition?.cover_url
    if (url) {
      return url.startsWith('http') ? url : `${reqUrl?.origin ?? ''}${url}`
    }
  }
  return `${reqUrl?.origin ?? ''}/favicon.ico`
})

useSeoMeta({
  title: () => profile.value?.user.display_name || 'Perfil',
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
  ogUrl: () => reqUrl?.href ?? '',
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

type VisibilityFilter = 'todos' | 'publico' | 'privado'
const visibilityFilter = ref<VisibilityFilter>('todos')

const logs = computed(() => profile.value?.logs || [])

const visibilityCounts = computed(() => {
  const all = logs.value.length
  let pub = 0
  let priv = 0
  for (const item of logs.value) {
    if (item.visibility === 'privado') {
      priv++
    } else {
      pub++
    }
  }
  return { todos: all, publico: pub, privado: priv }
})

const displayedLogs = computed(() => {
  if (!isOwner.value || visibilityFilter.value === 'todos') {
    return logs.value
  }
  return logs.value.filter((log) => log.visibility === visibilityFilter.value)
})

const readingMapData = computed(() => aggregateReadingMapData(displayedLogs.value))

const showMap = ref(false)
let mediaQueryList: MediaQueryList | null = null

function updateShowMap(e: MediaQueryListEvent | MediaQueryList) {
  showMap.value = e.matches
}

onMounted(() => {
  mediaQueryList = window.matchMedia('(min-width: 601px)')
  showMap.value = mediaQueryList.matches
  mediaQueryList.addEventListener('change', updateShowMap)
})

onUnmounted(() => {
  if (mediaQueryList) {
    mediaQueryList.removeEventListener('change', updateShowMap)
    mediaQueryList = null
  }
})

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
} = useBookFilters(displayedLogs)

function setVisibilityFilter(filter: VisibilityFilter) {
  visibilityFilter.value = filter
  resetFilters()
}

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

const copied = ref(false)
const copyFeedback = ref('')
let copyTimer: ReturnType<typeof setTimeout> | null = null

function writeToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text)
  }
  // execCommand is the only path left on non-secure origins (the LAN address
  // the cohort uses to test on their phones is plain http).
  return new Promise((resolve, reject) => {
    try {
      const field = document.createElement('textarea')
      field.value = text
      field.setAttribute('readonly', '')
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.appendChild(field)
      field.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(field)
      if (ok) {
        resolve()
      }
      else {
        reject(new Error('copy_failed'))
      }
    }
    catch (err) {
      reject(err instanceof Error ? err : new Error('copy_failed'))
    }
  })
}

async function copyProfileLink(userHandle: string) {
  const link = `${window.location.origin}/@${userHandle}`

  try {
    await writeToClipboard(link)
    copied.value = true
    copyFeedback.value = 'Link do perfil copiado!'
  }
  catch {
    copied.value = false
    copyFeedback.value = `Não foi possível copiar. Link: ${link}`
  }

  if (copyTimer) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => {
    copied.value = false
    copyFeedback.value = ''
  }, 3000)
}

onBeforeUnmount(() => {
  if (copyTimer) clearTimeout(copyTimer)
})
</script>

<style scoped>
.profile-page {
  width: 100%;
}

.profile-header {
  text-align: center;
  margin-bottom: var(--space-8, 32px);
}

/* Shrink-wraps the name + handle line so the actions row below can stretch to
   exactly that width. */
.identity {
  width: fit-content;
  max-width: 100%;
  margin: 0 auto;
}

.name-row {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: var(--space-3, 12px);
  flex-wrap: wrap;
}

.display-name {
  font-size: var(--font-size-3xl, 2rem);
  font-weight: 700;
  margin: 0;
  color: #fff;
  line-height: var(--line-height-tight, 1.2);
}

.handle {
  font-family: inherit;
  font-size: var(--font-size-3xl, 2rem);
  font-weight: 700;
  line-height: var(--line-height-tight, 1.2);
  color: var(--highlight, #f59e0b);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  transition: opacity 0.2s;
}

.handle:hover {
  opacity: 0.8;
}

.handle:focus-visible {
  outline: var(--focus-ring-width, 2px) solid var(--focus-ring-color, #f59e0b);
  outline-offset: var(--focus-ring-offset, 2px);
  border-radius: var(--radius-sm, 4px);
}

/* Reserves its own line height so the row below does not shift when the
   confirmation appears. */
.copy-feedback {
  margin: var(--space-1, 4px) 0 0 0;
  min-height: 1.25em;
  font-size: var(--font-size-xs, 0.75rem);
  color: var(--text-color, #9ab);
}

.profile-actions {
  display: flex;
  align-items: stretch;
  gap: var(--space-3, 12px);
  justify-content: center;
  margin-top: var(--space-5, 20px);
  margin-bottom: var(--space-6, 24px);
}

/* Each button takes an equal share, so the pair spans the name-row width. */
.profile-actions > * {
  flex: 1 1 0;
  justify-content: center;
  text-align: center;
  white-space: nowrap;
}

.btn-edit-profile {
  display: inline-flex;
  align-items: center;
  padding: var(--space-2, 8px) var(--space-4, 16px);
  font-size: var(--font-size-sm, 0.875rem);
  color: var(--text-color, #9ab);
  background-color: var(--card-bg, #232a31);
  border: 1px solid var(--input-bg, #2c3440);
  border-radius: var(--radius-sm, 4px);
  text-decoration: none;
  line-height: var(--line-height-normal, 1.5);
  transition: color 0.2s, border-color 0.2s, background-color 0.2s;
  min-height: 36px;
}

.btn-edit-profile:hover {
  color: #fff;
  border-color: var(--highlight, #f59e0b);
}

.btn-edit-profile:focus-visible {
  outline: var(--focus-ring-width, 2px) solid var(--focus-ring-color, #f59e0b);
  outline-offset: var(--focus-ring-offset, 2px);
}

.visibility-bar {
  display: flex;
  justify-content: center;
  margin-bottom: var(--space-6, 24px);
}

.visibility-nav {
  display: inline-flex;
  background-color: var(--card-bg, #232a31);
  padding: var(--space-1, 4px);
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--input-bg, #2c3440);
  gap: var(--space-1, 4px);
  flex-wrap: wrap;
  justify-content: center;
}

.visibility-tab {
  background: none;
  border: none;
  color: var(--text-color, #9ab);
  font-size: var(--font-size-sm, 0.875rem);
  font-family: inherit;
  font-weight: 500;
  padding: var(--space-2, 8px) var(--space-3, 12px);
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2, 8px);
  min-height: 36px;
  transition: color 0.2s, background-color 0.2s;
}

.visibility-tab:hover:not(.active) {
  color: #fff;
}

.visibility-tab.active {
  background-color: var(--highlight, #f59e0b);
  color: #14181c;
  font-weight: 700;
}

.visibility-tab:focus-visible {
  outline: var(--focus-ring-width, 2px) solid var(--focus-ring-color, #f59e0b);
  outline-offset: var(--focus-ring-offset, 2px);
}

.tab-count {
  font-size: var(--font-size-xs, 0.75rem);
  padding: 1px 6px;
  border-radius: var(--radius-full, 9999px);
  background-color: rgba(0, 0, 0, 0.25);
  color: inherit;
}

.visibility-tab.active .tab-count {
  background-color: rgba(20, 24, 28, 0.2);
  color: #14181c;
  font-weight: 700;
}

.empty-visibility-results {
  margin: var(--space-8, 32px) 0;
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

/* The actions row already carries the gap below it. */
.identity:has(.profile-actions) + .stats,
.identity:has(.profile-actions) + .bio + .stats {
  margin-top: 0;
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
  color: var(--highlight, #f59e0b);
  border: 1px solid var(--highlight, #f59e0b);
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
  color: var(--highlight, #f59e0b);
  margin-top: 2px;
}

.loading-state,
.error-state {
  padding: var(--space-12, 48px) var(--space-4, 16px);
  text-align: center;
}

@media (max-width: 600px) {
  /* A short display name would otherwise squeeze the two nowrap buttons past
     the viewport edge. */
  .identity {
    width: 100%;
  }
  .profile-actions {
    flex-wrap: wrap;
  }
  .stats {
    gap: var(--space-5, 20px);
  }
  .paginometer {
    gap: var(--space-5, 20px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .btn-edit-profile,
  .handle,
  .visibility-tab {
    transition: none;
  }
}
</style>
