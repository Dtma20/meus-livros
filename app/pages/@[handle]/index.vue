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
        action-label="Ir para o início"
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
        <div class="name-row">
          <h1 class="display-name">{{ profile.user.display_name }}</h1>
          <button
            type="button"
            class="handle"
            :aria-label="`Copiar link do perfil @${profile.user.handle}`"
            :title="copied ? 'Link copiado' : 'Copiar link do perfil'"
            @click="copyProfileLink(profile.user.handle)"
          >
            @{{ profile.user.handle }}
          </button>
          <div v-if="isOwner" class="profile-actions">
            <NuxtLink to="/app/perfil" class="btn btn-secondary btn-edit-profile">
              Editar perfil
            </NuxtLink>
            <a
              href="/api/library/export"
              download="meus-livros-export.json"
              class="btn btn-ghost export-link"
              title="Exportar biblioteca em JSON"
            >
              Exportar JSON
            </a>
          </div>
          <span class="copy-feedback" role="status" aria-live="polite">{{ copyFeedback }}</span>
        </div>
        <p v-if="profile.user.bio" class="bio">{{ profile.user.bio }}</p>

        <div class="stats-row">
          <p class="stats" aria-label="Totais da biblioteca">
            <span class="stat"><span class="stat-num">{{ headerStats.totalBooks.toLocaleString('pt-BR') }}</span> {{ headerStats.totalBooks === 1 ? 'livro' : 'livros' }}</span>
            <span class="stat"><span class="stat-num">{{ headerStats.uniqueAuthors.toLocaleString('pt-BR') }}</span> {{ headerStats.uniqueAuthors === 1 ? 'autor' : 'autores' }}</span>
            <span class="stat"><span class="stat-num">{{ headerStats.uniqueCountries.toLocaleString('pt-BR') }}</span> {{ headerStats.uniqueCountries === 1 ? 'país' : 'países' }}</span>
            <small v-if="hasActiveFilters" class="filter-indicator stats-filter-indicator">(filtros ativos)</small>
          </p>
          <NuxtLink :to="`/@${profile.user.handle}/estatisticas`" class="stats-link">
            Ver estatísticas
          </NuxtLink>
        </div>
      </header>

      <div v-if="logs.length === 0" class="empty-collection">
        <EmptyState
          v-if="isOwner"
          title="Você ainda não registrou nenhum livro."
          message="Assim que registrar seus primeiros livros, eles aparecerão aqui."
          action-label="Registrar leitura"
          action-href="/app/novo"
        />
        <EmptyState
          v-else
          title="Ainda não registrou nenhum livro."
          message="Assim que registrar seus primeiros livros, eles aparecerão aqui."
        />
      </div>

      <template v-else>
        <div v-if="isOwner" class="visibility-bar">
          <div class="visibility-nav" role="tablist" aria-label="Filtrar por visibilidade">
            <button
              id="vis-tab-todos"
              type="button"
              role="tab"
              :aria-selected="visibilityFilter === 'todos'"
              aria-controls="profile-collection"
              :tabindex="visibilityFilter === 'todos' ? 0 : -1"
              class="visibility-tab"
              :class="{ active: visibilityFilter === 'todos' }"
              @click="setVisibilityFilter('todos')"
              @keydown="onTabsKeydown($event, VISIBILITY_TABS, visibilityFilter, setVisibilityFilter, 'vis-tab-')"
            >
              Todos <span class="tab-count">{{ visibilityCounts.todos }}</span>
            </button>
            <button
              id="vis-tab-publico"
              type="button"
              role="tab"
              :aria-selected="visibilityFilter === 'publico'"
              aria-controls="profile-collection"
              :tabindex="visibilityFilter === 'publico' ? 0 : -1"
              class="visibility-tab"
              :class="{ active: visibilityFilter === 'publico' }"
              @click="setVisibilityFilter('publico')"
              @keydown="onTabsKeydown($event, VISIBILITY_TABS, visibilityFilter, setVisibilityFilter, 'vis-tab-')"
            >
              Públicos <span class="tab-count">{{ visibilityCounts.publico }}</span>
            </button>
            <button
              id="vis-tab-privado"
              type="button"
              role="tab"
              :aria-selected="visibilityFilter === 'privado'"
              aria-controls="profile-collection"
              :tabindex="visibilityFilter === 'privado' ? 0 : -1"
              class="visibility-tab"
              :class="{ active: visibilityFilter === 'privado' }"
              @click="setVisibilityFilter('privado')"
              @keydown="onTabsKeydown($event, VISIBILITY_TABS, visibilityFilter, setVisibilityFilter, 'vis-tab-')"
            >
              Privados <span class="tab-count">{{ visibilityCounts.privado }}</span>
            </button>
          </div>
        </div>

        <div
          id="profile-collection"
          :role="isOwner ? 'tabpanel' : undefined"
          :aria-labelledby="isOwner ? `vis-tab-${visibilityFilter}` : undefined"
        >
        <p
          v-if="isOwner && visibilityFilter !== 'todos' && !hasActiveFilters"
          class="visibility-summary"
          role="status"
          aria-live="polite"
        >
          Mostrando {{ displayedLogs.length.toLocaleString('pt-BR') }} de {{ logs.length.toLocaleString('pt-BR') }}
          {{ logs.length === 1 ? 'livro' : 'livros' }}
        </p>
        <div v-if="displayedLogs.length === 0" class="empty-visibility-results">
          <EmptyState
            v-if="visibilityFilter === 'privado'"
            title="Nenhum livro privado."
            message="Livros marcados como privados ao registrar ou editar aparecerão aqui."
            action-label="Registrar leitura"
            action-href="/app/novo"
          />
          <EmptyState
            v-else-if="visibilityFilter === 'publico'"
            title="Nenhum livro público."
            message="Livros marcados como públicos aparecerão aqui para outros leitores."
            action-label="Registrar leitura"
            action-href="/app/novo"
          />
        </div>

        <template v-else>
        <ClientOnly>
          <ReadingMap
            v-if="mapReady"
            :country-counts="readingMapData.countryCounts"
            :selected-country="filterCountry"
            :unmapped-countries="readingMapData.unmappedCountries"
            @select="filterCountry = $event"
          />
        </ClientOnly>

        <div class="controls-row">
          <div class="controls-filters" :class="{ 'is-diary-view': currentView === 'diario' }">
            <FilterBar
              v-model:genre="filterGenre"
              v-model:country="filterCountry"
              v-model:decade="filterDecade"
              v-model:sort-by="sortBy"
              :available-genres="availableGenres"
              :available-countries="availableCountries"
              :available-decades="availableDecades"
              :has-active-filters="hasActiveFilters"
              :shown-count="sortedBooks.length"
              :total-count="logs.length"
              @reset="resetFilters"
            />
          </div>

          <div class="view-toggle-bar">
            <span class="view-label">Ver como</span>
            <div class="view-nav" role="tablist" aria-label="Modo de visualização">
              <button
                id="view-tab-grade"
                type="button"
                role="tab"
                :aria-selected="currentView === 'grade'"
                aria-controls="profile-view-panel"
                :tabindex="currentView === 'grade' ? 0 : -1"
                class="view-tab"
                :class="{ active: currentView === 'grade' }"
                @keydown="onTabsKeydown($event, VIEW_TABS, currentView, setView, 'view-tab-')"
                @click="setView('grade')"
              >
                Grade
              </button>
              <button
                id="view-tab-diario"
                type="button"
                role="tab"
                :aria-selected="currentView === 'diario'"
                aria-controls="profile-view-panel"
                :tabindex="currentView === 'diario' ? 0 : -1"
                class="view-tab"
                :class="{ active: currentView === 'diario' }"
                @keydown="onTabsKeydown($event, VIEW_TABS, currentView, setView, 'view-tab-')"
                @click="setView('diario')"
              >
                Diário
              </button>
            </div>
          </div>
        </div>

        <p v-if="currentView === 'diario'" class="view-help">
          Cada leitura em ordem de data, com releituras separadas.
        </p>

        <div v-if="hasActiveFilters && sortedBooks.length === 0" class="empty-filter-results">
          <EmptyState
            title="Nenhum livro com esses filtros."
            :message="`Filtros ativos: ${activeFiltersDescription}.`"
            action-label="Limpar filtros"
            @action="resetFilters"
          />
        </div>

        <template v-else>
          <div
            id="profile-view-panel"
            class="profile-scroll-panel"
            role="tabpanel"
            :aria-labelledby="`view-tab-${currentView}`"
          >
          <DiaryList v-if="currentView === 'diario'" :logs="sortedBooks" />

          <BookGrid v-else>
            <div v-for="(log, i) in sortedBooks" :key="log.id" v-reveal class="book-card-item">
              <div v-if="log.finished_on === null || log.visibility === 'privado'" class="card-badges">
                <span
                  v-if="log.finished_on === null"
                  class="reading-badge"
                >
                  Lendo
                </span>
                <span
                  v-if="log.visibility === 'privado'"
                  class="private-badge"
                  title="Registro privado - visível apenas para você"
                >
                  Privado
                </span>
              </div>
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
          </div>
        </template>
        </template>
        </div>
    </template>
  </div>
</div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BookCard from '~/components/book/BookCard.vue'
import BookGrid from '~/components/book/BookGrid.vue'
import DiaryList from '~/components/profile/DiaryList.vue'
import FilterBar from '~/components/profile/FilterBar.vue'
import EmptyState from '~/components/ui/EmptyState.vue'
import ErrorState from '~/components/ui/ErrorState.vue'
import LoadingSkeleton from '~/components/ui/LoadingSkeleton.vue'
import { useBookFilters } from '~/composables/useBookFilters'
import { vReveal } from '~/composables/useScrollReveal'
import { aggregateReadingMapData } from '~/utils/reading-map'
import type { ProfileResponse } from '~~/shared/schemas/profile'
import type { AuthSessionUser } from '~/middleware/auth'

const ReadingMap = defineAsyncComponent(() => import('~/components/profile/ReadingMap.vue'))

definePageMeta({
  middleware: 'home-layout',
})

const route = useRoute()
const router = typeof useRouter === 'function' ? useRouter() : null
const handle = computed(() => (route.params.handle as string) || '')

const currentView = computed<'grade' | 'diario'>(() => {
  return route.query.vista === 'diario' ? 'diario' : 'grade'
})

function setView(view: 'grade' | 'diario') {
  const query = { ...route.query }
  if (view === 'diario') {
    query.vista = 'diario'
  } else {
    delete query.vista
  }
  if (router) {
    void router.push({ query })
  }
}

const requestFetch = useRequestFetch()
const event = import.meta.server && typeof useRequestEvent === 'function' ? useRequestEvent() : null
const reqUrl = typeof useRequestURL === 'function' ? useRequestURL() : null

const session = typeof useState === 'function'
  ? useState<{ user?: AuthSessionUser | null }>('auth:session', () => ({ user: null }))
  : ref({ user: null })

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

if (event && error.value) {
  const err = error.value as { statusCode?: number; status?: number } | null | undefined
  const status = err?.statusCode || err?.status || 500
  setResponseStatus(event, status)
}

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

const VISIBILITY_TABS: readonly VisibilityFilter[] = ['todos', 'publico', 'privado']
const VIEW_TABS: readonly ('grade' | 'diario')[] = ['grade', 'diario']

function onTabsKeydown<T extends string>(
  event: KeyboardEvent,
  order: readonly T[],
  current: T,
  select: (value: T) => void,
  idPrefix: string,
): void {
  const index = order.indexOf(current)
  let next = index
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % order.length
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + order.length) % order.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = order.length - 1
  else return
  event.preventDefault()
  const value = order[next]
  if (value === undefined) return
  select(value)
  nextTick(() => document.getElementById(`${idPrefix}${value}`)?.focus())
}
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

// Loaded only after mount, so the async chunk never holds back the page's Suspense.
const mapReady = ref(false)
onMounted(() => {
  mapReady.value = true
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
} = useBookFilters(displayedLogs)

// The header totals describe the whole library this viewer may see. They follow
// the genre/country/decade filters (marked "(filtros ativos)"), but not the
// owner's visibility tab: that tab only narrows the grid, and the count for it
// sits next to the grid ("Mostrando N de M livros").
const headerFilters = useBookFilters(logs)
watch(
  [filterGenre, filterCountry, filterDecade],
  ([genre, country, decade]) => {
    headerFilters.filterGenre.value = genre
    headerFilters.filterCountry.value = country
    headerFilters.filterDecade.value = decade
  },
  { immediate: true, flush: 'sync' },
)
const headerStats = headerFilters.filteredStats

const SORT_MODES = ['read_desc', 'read_asc', 'rating', 'year_desc', 'year_asc', 'alpha']
const FILTER_QUERY_KEYS = ['genero', 'pais', 'decada', 'ordem'] as const

function queryString(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' ? first : ''
}

// Filters live in the URL so a filtered view can be shared and survives a reload.
// Values that no longer match the library are ignored.
const initialGenre = queryString(route.query.genero)
if (availableGenres.value.includes(initialGenre)) filterGenre.value = initialGenre
const initialCountry = queryString(route.query.pais)
if (availableCountries.value.includes(initialCountry)) filterCountry.value = initialCountry
const initialDecade = queryString(route.query.decada)
if (availableDecades.value.map(String).includes(initialDecade)) filterDecade.value = initialDecade
const initialSort = queryString(route.query.ordem)
if (SORT_MODES.includes(initialSort)) sortBy.value = initialSort as typeof sortBy.value

watch([filterGenre, filterCountry, filterDecade, sortBy], () => {
  if (!router) return
  const wanted: Record<(typeof FILTER_QUERY_KEYS)[number], string> = {
    genero: filterGenre.value,
    pais: filterCountry.value,
    decada: filterDecade.value === '' || filterDecade.value == null ? '' : String(filterDecade.value),
    ordem: sortBy.value === 'read_desc' ? '' : sortBy.value,
  }
  const query: Record<string, unknown> = { ...route.query }
  let changed = false
  for (const key of FILTER_QUERY_KEYS) {
    if (queryString(query[key]) === wanted[key]) continue
    changed = true
    query[key] = wanted[key] === '' ? undefined : wanted[key]
  }
  if (changed) void router.replace({ query: query as typeof route.query })
})

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
  max-width: 72rem;
  margin: 0 auto;
}

.profile-header {
  text-align: left;
  margin-bottom: var(--space-6, 24px);
}

.name-row {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  flex-wrap: wrap;
}

.profile-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
}

.name-row > .copy-feedback {
  font-size: var(--font-size-xs, 0.75rem);
  color: var(--text-color, #9ab);
}

.handle {
  background: none;
  border: none;
  padding: 2px 0;
  min-height: 24px;
  font: inherit;
  font-size: var(--font-size-base, 1rem);
  color: var(--text-color, #9ab);
  cursor: pointer;
  border-radius: var(--radius-sm, 6px);
}

@media (pointer: coarse) {
  .handle {
    padding: 12px 8px;
    margin: -12px 4px -12px -8px;
    min-height: 44px;
    box-sizing: border-box;
  }
}

.handle:hover {
  color: var(--text-bright);
}

.handle:focus-visible {
  outline: var(--focus-ring-width, 2px) solid var(--focus-ring-color, #f59e0b);
  outline-offset: var(--focus-ring-offset, 2px);
}

.visibility-bar {
  margin-bottom: var(--space-4, 16px);
}

.visibility-nav {
  display: flex;
  gap: var(--space-5, 20px);
  flex-wrap: wrap;
}

.visibility-tab {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-color, #9ab);
  font-size: var(--font-size-sm, 0.875rem);
  font-family: inherit;
  font-weight: 500;
  padding: var(--space-2, 8px) 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2, 8px);
  min-height: 36px;
  transition: color 0.2s;
}

.visibility-tab:hover:not(.active) {
  color: var(--text-bright);
}

.visibility-tab.active {
  color: var(--text-bright);
  border-bottom-color: var(--highlight, #f59e0b);
}

.visibility-tab:focus-visible {
  outline: var(--focus-ring-width, 2px) solid var(--focus-ring-color, #f59e0b);
  outline-offset: var(--focus-ring-offset, 2px);
}

.tab-count {
  font-size: var(--font-size-xs, 0.75rem);
  color: var(--text-color, #9ab);
  font-variant-numeric: tabular-nums;
}

.empty-visibility-results {
  margin: var(--space-8, 32px) 0;
}

.visibility-summary {
  margin: 0 0 var(--space-3, 12px);
  font-size: var(--font-size-sm, 0.875rem);
  color: var(--text-color, #9ab);
  font-variant-numeric: tabular-nums;
}

.bio {
  color: var(--text-color, #9ab);
  font-size: var(--font-size-base, 1rem);
  max-width: 600px;
  margin: var(--space-2, 8px) 0 0;
  line-height: var(--line-height-relaxed, 1.6);
  white-space: pre-wrap;
}

.stats-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 var(--space-4, 16px);
  margin-top: var(--space-2, 8px);
}

.stats {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  margin: 0;
  color: var(--text-color, #9ab);
  font-size: var(--font-size-base, 1rem);
}

.stat + .stat::before {
  content: '\00b7';
  margin: 0 var(--space-2, 8px);
}

.stat-num {
  color: var(--text-bright);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.stats .stats-filter-indicator {
  margin: 0 0 0 var(--space-3, 12px);
}

.stats-link {
  display: inline-flex;
  align-items: center;
  font-size: var(--font-size-sm, 0.875rem);
  color: var(--text-bright);
  text-decoration: underline;
  text-decoration-color: var(--highlight, #f59e0b);
  text-decoration-thickness: 2px;
  text-underline-offset: 0.3em;
  min-height: 36px;
  border-radius: var(--radius-sm, 4px);
  transition: color 0.2s;
}

.stats-link:hover {
  color: var(--highlight, #f59e0b);
}

.stats-link:focus-visible {
  outline: var(--focus-ring-width, 2px) solid var(--focus-ring-color, #f59e0b);
  outline-offset: var(--focus-ring-offset, 2px);
}

.is-diary-view :deep(.sort-field) {
  display: none;
}

.controls-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
}

.controls-filters {
  flex: 1;
  min-width: 0;
}

.view-toggle-bar {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-1, 4px);
  flex-shrink: 0;
}

.view-label {
  color: var(--text-color, #9ab);
  font-size: var(--font-size-xs, 0.75rem);
  line-height: var(--line-height-tight, 1.2);
}

.view-nav {
  display: inline-flex;
  border: 1px solid var(--input-bg, #2c3440);
  border-radius: var(--radius-sm, 4px);
  overflow: hidden;
}

.view-tab {
  background: none;
  border: none;
  color: var(--text-color, #9ab);
  font-size: var(--font-size-sm, 0.875rem);
  font-family: inherit;
  font-weight: 500;
  padding: 0 var(--space-4, 16px);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  transition: color 0.2s, background-color 0.2s;
}

.view-tab + .view-tab {
  border-left: 1px solid var(--input-bg, #2c3440);
}

.view-tab:hover:not(.active) {
  color: var(--text-bright);
}

.view-tab.active {
  color: var(--text-bright);
  background-color: var(--input-bg, #2c3440);
}

.view-tab:focus-visible {
  outline: var(--focus-ring-width, 2px) solid var(--focus-ring-color, #f59e0b);
  outline-offset: -2px;
}

.view-help {
  margin: 0 0 var(--space-4, 16px);
  color: var(--text-color, #9ab);
  font-size: var(--font-size-sm, 0.875rem);
}

@media (max-width: 640px) {
  .controls-row {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-3, 12px);
  }

  .view-toggle-bar {
    order: -1;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}

.profile-scroll-panel {
  max-height: 640px;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  padding-right: var(--space-2, 8px);
  padding-bottom: var(--space-4, 16px);
  margin-right: calc(-1 * var(--space-2, 8px));
  scrollbar-width: thin;
  scrollbar-color: var(--input-bg, #2c3440) transparent;
}

.profile-scroll-panel::-webkit-scrollbar {
  width: 6px;
}
.profile-scroll-panel::-webkit-scrollbar-track {
  background: transparent;
}
.profile-scroll-panel::-webkit-scrollbar-thumb {
  background: var(--input-bg, #2c3440);
  border-radius: var(--radius-full, 9999px);
}
.profile-scroll-panel::-webkit-scrollbar-thumb:hover {
  background: var(--text-color, #9ab);
}

.book-card-item {
  position: relative;
  opacity: 0;
  transform: translateY(24px);
  transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  transition-delay: 0s;
  will-change: opacity, transform;
  content-visibility: auto;
  contain-intrinsic-size: 0 240px;
}

.book-card-item.is-revealed {
  opacity: 1;
  transform: translateY(0);
}

.book-card-item.is-revealed:nth-child(6n + 1) { transition-delay: 0.03s; }
.book-card-item.is-revealed:nth-child(6n + 2) { transition-delay: 0.06s; }
.book-card-item.is-revealed:nth-child(6n + 3) { transition-delay: 0.09s; }
.book-card-item.is-revealed:nth-child(6n + 4) { transition-delay: 0.12s; }
.book-card-item.is-revealed:nth-child(6n + 5) { transition-delay: 0.15s; }
.book-card-item.is-revealed:nth-child(6n + 6) { transition-delay: 0.18s; }

.card-badges {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  pointer-events: none;
}

.private-badge,
.reading-badge {
  background-color: rgba(0, 0, 0, 0.85);
  color: var(--highlight, #f59e0b);
  border: 1px solid var(--highlight, #f59e0b);
  font-size: var(--font-size-xs, 0.75rem);
  padding: 2px 6px;
  border-radius: var(--radius-sm, 4px);
  font-weight: 600;
  pointer-events: none;
  white-space: nowrap;
}

.filter-indicator {
  font-size: var(--font-size-xs, 0.75rem);
  color: var(--text-color, #9ab);
  font-weight: 400;
}

.loading-state,
.error-state {
  padding: var(--space-12, 48px) var(--space-4, 16px);
  text-align: center;
}

@media (pointer: coarse) {
  .btn-edit-profile,
  .export-link,
  .visibility-tab,
  .view-tab {
    min-height: var(--target-min-size, 44px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .btn-edit-profile,
  .export-link,
  .handle,
  .visibility-tab,
  .view-tab,
  .book-card-item {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
  }
}
</style>
