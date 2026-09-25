<template>
  <div class="log-page-container">
    <!-- Fluxo 1: Registrar leitura a partir de um livro selecionado na estante (?work_id=...) -->
    <div v-if="isLoggingFromShelf" class="log-page-card wide-card">
      <div class="shelf-back-nav">
        <NuxtLink to="/" class="shelf-back-link">
          ← Voltar para a estante
        </NuxtLink>
      </div>

      <h1 class="page-title">Registrar leitura</h1>
      <p class="page-desc">
        Acompanhe seu progresso ou registre a conclusão da leitura deste livro.
      </p>

      <div v-if="loadingWork" class="loading-state">
        <p>Carregando dados do livro...</p>
      </div>
      <div v-else-if="workError" class="error-state">
        <p>Não foi possível carregar os detalhes deste livro.</p>
        <NuxtLink to="/" class="btn btn-secondary mt-3">
          Voltar para a página inicial
        </NuxtLink>
      </div>
      <LogForm
        v-else-if="initialWork"
        mode="create"
        :initial-work="initialWork"
        disable-change-book
      />
    </div>

    <!-- Fluxo 2: Adicionar livros ao catálogo/estante ou importar via JSON -->
    <div v-else class="log-page-card" :class="{ 'wide-card': activeTab === 'cadastrar' }">
      <h1 class="page-title">{{ pageTitle }}</h1>
      <p class="page-desc">
        {{ pageDesc }}
      </p>

      <div class="tabs-nav tabs-nav--full" role="tablist" aria-label="Opções para adicionar livro">
        <button
          type="button"
          role="tab"
          class="tab-btn"
          :class="{ active: activeTab === 'cadastrar' }"
          :aria-selected="activeTab === 'cadastrar'"
          @click="selectTab('cadastrar')"
        >
          Cadastrar livro
        </button>
        <button
          type="button"
          role="tab"
          class="tab-btn"
          :class="{ active: activeTab === 'json' }"
          :aria-selected="activeTab === 'json'"
          @click="selectTab('json')"
        >
          Importar JSON
        </button>
      </div>

      <AddBookForm
        v-if="activeTab === 'cadastrar'"
        hide-header
        return-to="/"
      />
      <JsonImportSection v-else />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LogForm from '~/components/log/LogForm.vue'
import AddBookForm from '~/components/search/AddBookForm.vue'
import JsonImportSection from '~/components/log/JsonImportSection.vue'
import type { WorkWithDetails } from '~~/shared/schemas/work'
import type { SearchResult } from '~~/shared/schemas/search'

definePageMeta({
  layout: 'app',
  middleware: 'auth',
})

let route: any = undefined
try {
  route = useRoute()
} catch {
  // outside vue-router context (e.g. unit tests)
}

let router: any = undefined
try {
  router = useRouter()
} catch {
  // outside vue-router context (e.g. unit tests)
}

type TabKey = 'cadastrar' | 'json'

const activeTab = ref<TabKey>('cadastrar')

// Inicializar aba a partir da query
function parseTab(tabParam: unknown): TabKey {
  if (tabParam === 'json' || tabParam === 'importar') return 'json'
  return 'cadastrar'
}

activeTab.value = parseTab(route?.query?.tab)

if (route) {
  watch(
    () => route?.query?.tab,
    (val) => {
      activeTab.value = parseTab(val)
    },
  )
}

function selectTab(tab: TabKey) {
  activeTab.value = tab
  if (router?.replace && route) {
    void router.replace({
      query: {
        ...(route.query || {}),
        tab: tab === 'cadastrar' ? undefined : tab,
      },
    })
  }
}

// Obter workId opcional para leitura a partir da estante
const workId = computed(() => {
  const q = route?.query?.work_id || route?.query?.workId
  return typeof q === 'string' ? q.trim() : ''
})

const isLoggingFromShelf = computed(() => Boolean(workId.value))

const initialWork = ref<SearchResult | null>(null)
const loadingWork = ref(false)
const workError = ref(false)

watch(
  workId,
  async (id) => {
    if (!id) {
      initialWork.value = null
      loadingWork.value = false
      workError.value = false
      return
    }

    loadingWork.value = true
    workError.value = false

    try {
      const data = await $fetch<WorkWithDetails>(`/api/works/${id}`)
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
    }
  },
  { immediate: true },
)

const pageTitle = computed(() => {
  if (isLoggingFromShelf.value) return 'Registrar leitura'
  if (activeTab.value === 'json') return 'Importar biblioteca via JSON'
  return 'Cadastrar livro'
})

const pageDesc = computed(() => {
  if (isLoggingFromShelf.value) {
    return 'Acompanhe seu progresso ou registre a conclusão da leitura deste livro.'
  }
  if (activeTab.value === 'json') {
    return 'Envie um arquivo JSON para importar vários livros e leituras de uma só vez.'
  }
  return 'Adicione um novo livro à sua estante para começar a ler ou guardar no catálogo.'
})

useSeoMeta({
  title: () => pageTitle.value,
})
</script>

<style scoped>
.log-page-container {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: var(--space-4) 0;
  width: 100%;
}

.log-page-card {
  background-color: var(--card-bg);
  border-radius: var(--radius-md);
  padding: var(--space-8);
  width: 100%;
  max-width: 580px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  transition: max-width 0.2s ease;
}

.log-page-card.wide-card {
  max-width: 640px;
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
  font-size: var(--font-size-2xl);
  margin-top: 0;
  margin-bottom: var(--space-2);
  color: #fff;
}

.page-desc {
  color: var(--text-color);
  font-size: var(--font-size-sm);
  margin-top: 0;
  margin-bottom: var(--space-6);
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

@media (max-width: 640px) {
  .log-page-card {
    padding: var(--space-4);
    border-radius: 0;
    box-shadow: none;
  }
}
</style>
