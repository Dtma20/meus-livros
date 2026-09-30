<template>
  <div class="log-page-container">
    <div v-if="isLoggingFromShelf" class="log-page-card wide-card">
      <div class="shelf-back-nav">
        <NuxtLink to="/app/novo" class="shelf-back-link">
          ← Escolher outro livro
        </NuxtLink>
      </div>

      <h1 ref="shelfHeadingRef" class="page-title" tabindex="-1">Registrar leitura</h1>
      <p class="visually-hidden" role="status" aria-live="polite">{{ selectionAnnouncement }}</p>
      <p class="page-desc">
        Acompanhe seu progresso ou registre a conclusão da leitura deste livro.
      </p>

      <div v-if="loadingWork" class="loading-state">
        <p>Carregando dados do livro...</p>
      </div>
      <div v-else-if="workError" class="error-state">
        <p>Não foi possível carregar os detalhes deste livro.</p>
        <NuxtLink to="/app/novo" class="btn btn-secondary mt-3">
          Escolher outro livro
        </NuxtLink>
      </div>
      <LogForm
        v-else-if="initialWork"
        mode="create"
        :initial-work="initialWork"
        disable-change-book
      />
    </div>

    <div v-else class="log-page-card" :class="{ 'wide-card': activeTab === 'novo' }">
      <h1 class="page-title">{{ pageTitle }}</h1>
      <p class="page-desc">
        {{ pageDesc }}
      </p>

      <div class="tabs-nav tabs-nav--full" role="tablist" aria-label="Opções para adicionar livro">
        <button
          id="log-tab-buscar"
          type="button"
          role="tab"
          class="tab-btn"
          :class="{ active: activeTab === 'buscar' }"
          :aria-selected="activeTab === 'buscar'"
          aria-controls="log-tab-panel"
          :tabindex="activeTab === 'buscar' ? 0 : -1"
          @click="selectTab('buscar')"
          @keydown="onTabKeydown($event)"
        >
          <span class="tab-label-long">Buscar no catálogo</span><span class="tab-label-short">Catálogo</span>
        </button>
        <button
          id="log-tab-novo"
          type="button"
          role="tab"
          class="tab-btn"
          :class="{ active: activeTab === 'novo' }"
          :aria-selected="activeTab === 'novo'"
          aria-controls="log-tab-panel"
          :tabindex="activeTab === 'novo' ? 0 : -1"
          @click="selectTab('novo')"
          @keydown="onTabKeydown($event)"
        >
          <span class="tab-label-long">Adicionar livro novo</span><span class="tab-label-short">Livro novo</span>
        </button>
        <button
          id="log-tab-json"
          type="button"
          role="tab"
          class="tab-btn"
          :class="{ active: activeTab === 'json' }"
          :aria-selected="activeTab === 'json'"
          aria-controls="log-tab-panel"
          :tabindex="activeTab === 'json' ? 0 : -1"
          @click="selectTab('json')"
          @keydown="onTabKeydown($event)"
        >
          <span class="tab-label-long">Importar de arquivo</span><span class="tab-label-short">De arquivo</span>
        </button>
      </div>

      <div id="log-tab-panel" role="tabpanel" :aria-labelledby="`log-tab-${activeTab}`">
      <div v-if="activeTab === 'buscar'" ref="searchContainerRef" class="search-tab-content">
        <SearchBox
          landmark-label="Buscar livro para registrar"
          :navigate-on-select="false"
          @select="onWorkSelect"
        />
      </div>
      <AddBookForm
        v-else-if="activeTab === 'novo'"
        hide-header
        return-to="/app/novo"
      />
      <JsonImportSection v-else />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LogForm from '~/components/log/LogForm.vue'
import SearchBox from '~/components/search/SearchBox.vue'
import AddBookForm from '~/components/search/AddBookForm.vue'
import JsonImportSection from '~/components/log/JsonImportSection.vue'
import type { WorkWithDetails } from '~~/shared/schemas/work'
import type { SearchResult } from '~~/shared/schemas/search'

definePageMeta({
  layout: 'app',
  middleware: 'auth',
})

let route: ReturnType<typeof useRoute> | undefined
try {
  route = useRoute()
} catch {
}

let router: ReturnType<typeof useRouter> | undefined
try {
  router = useRouter()
} catch {
}

type TabKey = 'buscar' | 'novo' | 'json'

const activeTab = ref<TabKey>('buscar')
const searchContainerRef = ref<HTMLElement | null>(null)

function focusSearchInput(): void {
  if (typeof window === 'undefined') return
  if (!window.matchMedia('(min-width: 601px)').matches) return
  nextTick(() => {
    const input = searchContainerRef.value?.querySelector<HTMLInputElement>('input[type="search"]')
    input?.focus()
  })
}

function parseTab(tabParam: unknown): TabKey {
  if (tabParam === 'novo' || tabParam === 'cadastrar') return 'novo'
  if (tabParam === 'json' || tabParam === 'importar') return 'json'
  return 'buscar'
}

activeTab.value = parseTab(route?.query?.tab)

if (route) {
  watch(
    () => route?.query?.tab,
    (val) => {
      activeTab.value = parseTab(val)
      if (activeTab.value === 'buscar') {
        focusSearchInput()
      }
    },
  )
}

const TAB_ORDER: readonly TabKey[] = ['buscar', 'novo', 'json']

function onTabKeydown(event: KeyboardEvent): void {
  const index = TAB_ORDER.indexOf(activeTab.value)
  let next = index
  if (event.key === 'ArrowRight') next = (index + 1) % TAB_ORDER.length
  else if (event.key === 'ArrowLeft') next = (index - 1 + TAB_ORDER.length) % TAB_ORDER.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = TAB_ORDER.length - 1
  else return
  event.preventDefault()
  const tab = TAB_ORDER[next]
  if (!tab) return
  selectTab(tab)
  nextTick(() => document.getElementById(`log-tab-${tab}`)?.focus())
}

function selectTab(tab: TabKey) {
  activeTab.value = tab
  if (tab === 'buscar') {
    focusSearchInput()
  }
  if (router?.replace && route) {
    void router.replace({
      query: {
        ...(route.query || {}),
        tab: tab === 'buscar' ? undefined : tab,
      },
    })
  }
}

onMounted(() => {
  isMounted = true
  if (!isLoggingFromShelf.value && activeTab.value === 'buscar') {
    focusSearchInput()
  }
})

const workId = computed(() => {
  const q = route?.query?.work_id || route?.query?.workId
  return typeof q === 'string' ? q.trim() : ''
})

const isLoggingFromShelf = computed(() => Boolean(workId.value))

const initialWork = ref<SearchResult | null>(null)
const loadingWork = ref(false)
const workError = ref(false)

// Escolher um livro troca a tela inteira; sem isto o foco caía no <body>.
// Leva o foco ao título do formulário e anuncia o livro escolhido.
const shelfHeadingRef = ref<HTMLElement | null>(null)
const selectionAnnouncement = ref('')
let focusAfterLoad = false
// Só depois de montar: numa carga direta com ?work_id o foco fica onde o navegador o pôs.
let isMounted = false

function focusShelfHeading(): void {
  focusAfterLoad = false
  void nextTick(() => {
    shelfHeadingRef.value?.focus()
    selectionAnnouncement.value = initialWork.value
      ? `Livro escolhido: ${initialWork.value.title}.`
      : 'Não foi possível carregar os detalhes deste livro.'
  })
}

function onWorkSelect(work: SearchResult): void {
  if (!work?.id) return
  if (router?.push) {
    void router.push({
      query: {
        work_id: work.id,
      },
    })
  }
}

watch(
  workId,
  async (id) => {
    if (id && isMounted) {
      focusAfterLoad = true
      selectionAnnouncement.value = ''
    }
    if (!id) {
      initialWork.value = null
      loadingWork.value = false
      workError.value = false
      return
    }

    loadingWork.value = true
    workError.value = false

    try {
      const data = await $fetch<WorkWithDetails>(`/api/works/${id}`, {
        timeout: 15_000,
        retry: 0,
      })
      if (data) {
        initialWork.value = {
          id: data.id,
          slug: data.slug,
          title: data.title,
          authors: data.authors.map((a) => ({ name: a.name, slug: a.slug })),
          first_published_year: data.first_published_year,
          cover_url: data.cover_url,
          log_count: data.log_count ?? 0,
        }
      } else {
        workError.value = true
      }
    } catch {
      workError.value = true
      initialWork.value = null
    } finally {
      loadingWork.value = false
      if (focusAfterLoad && workId.value === id) {
        focusShelfHeading()
      }
    }
  },
  { immediate: true },
)

const pageTitle = computed(() => {
  if (isLoggingFromShelf.value) return 'Registrar leitura'
  if (activeTab.value === 'novo') return 'Adicionar livro novo'
  if (activeTab.value === 'json') return 'Importar livros de um arquivo'
  return 'Registrar leitura'
})

const pageDesc = computed(() => {
  if (isLoggingFromShelf.value) {
    return 'Acompanhe seu progresso ou registre a conclusão da leitura deste livro.'
  }
  if (activeTab.value === 'novo') {
    return 'Adicione um novo livro à sua estante para começar a ler ou guardar no catálogo.'
  }
  if (activeTab.value === 'json') {
    return 'Traga vários livros e leituras de uma vez, a partir de um arquivo exportado (.json).'
  }
  return 'Procure o livro no catálogo do grupo. Se ninguém cadastrou ainda, adicione-o.'
})

useSeoMeta({
  title: () => pageTitle.value,
})
</script>

<style scoped>
.log-page-container {
  width: 100%;
  max-width: 72rem;
  margin: 0 auto;
  padding: var(--space-2) 0;
}

.log-page-card {
  width: 100%;
  max-width: 40rem;
}

.shelf-back-nav {
  margin-bottom: var(--space-4);
}

.shelf-back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--text-color);
  font-size: var(--font-size-sm);
  text-decoration: none;
  transition: color 0.2s;
}

.shelf-back-link:hover {
  color: var(--highlight);
}

.page-title {
  font-family: var(--font-serif);
  font-size: var(--font-size-2xl);
  font-weight: 600;
  letter-spacing: -0.015em;
  margin-top: 0;
  margin-bottom: var(--space-2);
  color: var(--text-bright);
}

.page-title:focus {
  outline: none;
}

.page-title:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.page-desc {
  color: var(--text-color);
  font-size: var(--font-size-sm);
  margin-top: 0;
  margin-bottom: var(--space-6);
}

.search-tab-content {
  width: 100%;
}

.search-tab-content :deep(.search-box) {
  max-width: none;
}

.loading-state,
.error-state {
  text-align: center;
  padding: var(--space-6) var(--space-4);
  color: var(--text-color);
  font-size: var(--font-size-sm);
}

.mt-3 {
  margin-top: var(--space-3);
}


.tab-label-short {
  display: none;
}

@media (max-width: 480px) {
  .tab-label-long {
    display: none;
  }

  .tab-label-short {
    display: inline;
  }
}
</style>
