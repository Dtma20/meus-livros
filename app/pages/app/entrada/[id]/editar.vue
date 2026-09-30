<template>
  <div class="log-page-container">
    <div class="log-page-card">
      <h1 class="page-title">{{ concluding ? 'Concluir leitura' : 'Editar registro' }}</h1>
      <p class="page-desc">
        {{ concluding ? 'Dê a nota, escreva a resenha se quiser e salve para concluir.' : 'Atualize sua leitura ou corrija as informações do livro.' }}
      </p>

      <div v-if="pending" class="loading-state">
        <p>Carregando registro…</p>
      </div>

      <div v-else-if="error || !log" class="error-state">
        <p class="error-text">Registro não encontrado ou você não tem permissão para editá-lo.</p>
        <NuxtLink to="/" class="back-link">← Ir para o início</NuxtLink>
      </div>

      <template v-else>
        <div class="tabs-nav tabs-nav--full" role="tablist" aria-label="O que editar">
          <button
            id="tab-registro"
            type="button"
            role="tab"
            class="tab-btn"
            :class="{ active: activeTab === 'registro' }"
            :aria-selected="activeTab === 'registro'"
            aria-controls="panel-registro"
            :tabindex="activeTab === 'registro' ? 0 : -1"
            @click="activeTab = 'registro'"
            @keydown="onTabKeydown($event)"
          >
            Editar registro
          </button>
          <button
            id="tab-livro"
            type="button"
            role="tab"
            class="tab-btn"
            :class="{ active: activeTab === 'livro' }"
            :aria-selected="activeTab === 'livro'"
            aria-controls="panel-livro"
            :tabindex="activeTab === 'livro' ? 0 : -1"
            @click="activeTab = 'livro'"
            @keydown="onTabKeydown($event)"
          >
            Editar informações do livro
          </button>
        </div>

        <div
          v-show="activeTab === 'registro'"
          id="panel-registro"
          role="tabpanel"
          aria-labelledby="tab-registro"
        >
          <LogForm
            :key="logFormKey"
            mode="edit"
            :initial-log="log"
            :finishing="finishing"
          />
        </div>

        <div
          v-show="activeTab === 'livro'"
          id="panel-livro"
          role="tabpanel"
          aria-labelledby="tab-livro"
          class="book-panel"
        >
          <p class="book-edit-warning">
            Salvar aqui recarrega a aba "Editar registro": alterações não salvas da leitura são descartadas.
          </p>

          <p v-if="reloadError" class="error-text" role="alert">{{ reloadError }}</p>

          <div v-if="workError && !work" class="book-data-state">
            <p class="error-text">Não foi possível carregar os dados do livro.</p>
          </div>

          <div v-else-if="!work" class="book-data-state">
            <p>Carregando dados do livro…</p>
          </div>

          <template v-else>
            <p class="book-shared-desc">
              O catálogo é compartilhado: qualquer pessoa do grupo pode corrigir este livro, e fica
              registrado quem alterou por último.
            </p>

            <section class="edit-section">
              <WorkEditForm :work="work" @saved="refreshAll" />
            </section>

            <section class="edit-section">
              <h2 class="section-title">Edições</h2>
              <p class="section-desc">
                Uma edição guarda ISBN, editora, páginas e capa. Um livro pode não ter nenhuma - escolher
                a edição é opcional.
              </p>

              <div v-if="work.editions.length > 0" class="editions-list">
                <EditionEditor
                  v-for="edition in work.editions"
                  :key="edition.id"
                  :work-id="work.id"
                  :work-title="work.title"
                  :edition="edition"
                  @saved="refreshAll"
                  @deleted="refreshAll"
                />
              </div>

              <p v-else class="empty-note">Nenhuma edição cadastrada ainda.</p>

              <EditionEditor
                v-if="addingEdition"
                :work-id="work.id"
                :work-title="work.title"
                :edition="null"
                @saved="onEditionAdded"
                @cancel="addingEdition = false"
              />

              <button
                v-else
                type="button"
                class="btn btn-secondary"
                @click="addingEdition = true"
              >
                Adicionar edição
              </button>
            </section>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRoute } from 'vue-router'
import EditionEditor from '~/components/book/EditionEditor.vue'
import WorkEditForm from '~/components/book/WorkEditForm.vue'
import LogForm from '~/components/log/LogForm.vue'
import type { LogWithDetails } from '~~/shared/schemas/log'
import type { WorkWithDetails } from '~~/shared/schemas/work'

definePageMeta({
  layout: 'app',
  middleware: 'auth',
})

const route = useRoute()
const id = computed(() => route.params.id as string)

// `?terminar=1` vem do atalho "Terminei": o formulário abre pronto para concluir.
const finishing = computed(() => route.query.terminar === '1')

const logFormKey = ref(0)
const addingEdition = ref(false)
type TabKey = 'registro' | 'livro'
const activeTab = ref<TabKey>('registro')

const TAB_ORDER: readonly TabKey[] = ['registro', 'livro']

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
  activeTab.value = tab
  nextTick(() => document.getElementById(`tab-${tab}`)?.focus())
}

const { data: log, pending, error } = useAsyncData<LogWithDetails>(
  `log-${id.value}`,
  () =>
    $fetch<LogWithDetails>(`/api/logs/${id.value}` as string, {
      timeout: 15_000,
      retry: 0,
    }),
)

// Mesma regra do LogForm: "Terminei" só vale para uma leitura em andamento.
const concluding = computed(() => finishing.value && !log.value?.finished_on)

const slug = computed(() => log.value?.work?.slug || '')

function fetchWork(workSlug: string): Promise<WorkWithDetails> {
  return $fetch<WorkWithDetails>(`/api/works/${encodeURIComponent(workSlug)}` as string, {
    timeout: 15_000,
    retry: 0,
  })
}

// No SSR as duas buscas correm juntas e o slug ainda está vazio quando esta
// começa; sem o fallback o payload levava `null` e, como o slug não muda mais
// depois da hidratação, o `watch` nunca refazia a busca.
const { data: work, error: workError } = useAsyncData<WorkWithDetails | null>(
  `entry-work-${id.value}`,
  async () => {
    const workSlug = slug.value
      || (await $fetch<LogWithDetails>(`/api/logs/${id.value}` as string, { timeout: 15_000, retry: 0 })).work?.slug
    return workSlug ? fetchWork(workSlug) : null
  },
  { watch: [slug] },
)

const reloadError = ref('')

async function refreshAll(): Promise<void> {
  try {
    const [freshLog, freshWork] = await Promise.all([
      $fetch<LogWithDetails>(`/api/logs/${id.value}` as string, { timeout: 15_000, retry: 0 }),
      fetchWork(slug.value),
    ])
    log.value = freshLog
    work.value = freshWork
    reloadError.value = ''
    logFormKey.value++
  } catch {
    reloadError.value = 'As alterações foram salvas, mas não foi possível recarregar os dados. Recarregue a página.'
  }
}

async function onEditionAdded(): Promise<void> {
  addingEdition.value = false
  await refreshAll()
}

useSeoMeta({
  title: () => {
    const verb = concluding.value ? 'Concluir leitura' : 'Editar'
    if (!log.value) return concluding.value ? verb : 'Editar registro'
    return `${verb}: ${log.value.work.title}`
  },
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

.page-title {
  font-family: var(--font-serif);
  font-size: var(--font-size-2xl);
  font-weight: 600;
  letter-spacing: -0.015em;
  margin-top: 0;
  margin-bottom: var(--space-2);
  color: var(--text-bright);
}

.page-desc {
  color: var(--text-color);
  font-size: var(--font-size-sm);
  margin-top: 0;
  margin-bottom: var(--space-6);
}

.loading-state,
.error-state {
  padding: var(--space-6) 0;
  text-align: center;
  color: var(--text-color);
}

.error-text {
  color: var(--danger);
  margin-bottom: var(--space-4);
}

.back-link {
  color: var(--highlight);
  text-decoration: none;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  min-height: 44px;
}

.back-link:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
}

.back-link:hover {
  text-decoration: underline;
}

.book-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.book-data-state {
  padding: var(--space-4) 0;
  color: var(--text-color);
  font-size: var(--font-size-sm);
  text-align: center;
}

.book-edit-warning {
  color: var(--text-color);
  font-size: var(--font-size-sm);
  margin: 0;
  line-height: var(--line-height-normal);
}

.book-shared-desc,
.section-desc {
  color: var(--text-color);
  font-size: var(--font-size-sm);
  margin: 0;
  line-height: var(--line-height-normal);
}

.edit-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.section-title {
  font-family: var(--font-serif);
  font-size: var(--font-size-xl);
  color: #fff;
  margin: 0;
}

.editions-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.empty-note {
  color: var(--text-color);
  font-size: var(--font-size-sm);
  margin: 0;
}
</style>
