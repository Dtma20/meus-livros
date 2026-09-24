<template>
  <div class="log-page-container">
    <div class="log-page-card">
      <h1 class="page-title">Editar registro</h1>
      <p class="page-desc">
        Atualize os dados da sua leitura ou exclua a entrada.
      </p>

      <div v-if="pending" class="loading-state">
        <p>Carregando registro…</p>
      </div>

      <div v-else-if="error || !log" class="error-state">
        <p class="error-text">Registro não encontrado ou você não tem permissão para editá-lo.</p>
        <NuxtLink to="/" class="back-link">← Voltar para o início</NuxtLink>
      </div>

      <template v-else>
        <LogForm
          :key="logFormKey"
          mode="edit"
          :initial-log="log"
        />

        <div v-if="workError && !work" class="book-data-state">
          <p class="error-text">Não foi possível carregar os dados do livro.</p>
        </div>

        <div v-else-if="!work" class="book-data-state">
          <p>Carregando dados do livro…</p>
        </div>

        <div v-else class="book-details-section">
          <p v-if="reloadError" class="error-text" role="alert">{{ reloadError }}</p>
          <p class="book-edit-warning">
            Salve a leitura antes de alterar os dados do livro — alterações não salvas da leitura são descartadas.
          </p>

          <details class="book-details">
            <summary class="book-details-summary">Dados do livro</summary>

            <div class="book-details-content">
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
                  Uma edição guarda ISBN, editora, páginas e capa. Um livro pode não ter nenhuma — escolher
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
            </div>
          </details>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
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

const logFormKey = ref(0)
const addingEdition = ref(false)

// Not awaited: a top-level await makes <script setup> async, the page needs a
// Suspense boundary to render at all, and the `v-if="pending"` branch below
// becomes dead code. The refs arrive immediately and the template shows the
// loading state, which is what it was written to do.
//
// The URL is built at runtime, so it is typed as plain `string` rather than
// handed to Nuxt's typed-route resolution. With the `/api/auth/**` catch-all in
// the route map, letting it infer blows the conditional-type recursion limit
// (TS2321) and the whole page stops typechecking.
const { data: log, pending, error } = useAsyncData<LogWithDetails>(
  `log-${id.value}`,
  () =>
    $fetch<LogWithDetails>(`/api/logs/${id.value}` as string, {
      // Without a timeout this promise can never settle: a lost request
      // leaves `pending` stuck true and the user staring at "Carregando registro…" forever.
      timeout: 15_000,
      retry: 0,
    }),
)

const slug = computed(() => log.value?.work?.slug || '')

// Also not awaited, for the same reason: setup stays synchronous.
function fetchWork(workSlug: string): Promise<WorkWithDetails> {
  return $fetch<WorkWithDetails>(`/api/works/${encodeURIComponent(workSlug)}` as string, {
    timeout: 15_000,
    retry: 0,
  })
}

// Static key plus `watch`: a getter key would refetch on its own when the slug
// arrives, and the watch would fire the same request a second time.
const { data: work, error: workError } = useAsyncData<WorkWithDetails | null>(
  `entry-work-${id.value}`,
  () => (slug.value ? fetchWork(slug.value) : Promise.resolve(null)),
  { watch: [slug] },
)

const reloadError = ref('')

// Fetched by hand rather than through each useAsyncData's `refresh`: a failed
// refresh would set `error` and swap the whole page to "Registro não
// encontrado" for an entry that exists. Here a failure keeps what is on screen
// and says so. Remounting LogForm (new key) is what makes it re-read the title,
// the authors and the edition list — without it, deleting the edition this
// entry uses leaves LogForm holding an edition_id that no longer exists.
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

// Declared after useAsyncData on purpose. The title getter reads `log`, and
// unhead evaluates it synchronously on the first watchEffect run — with the
// call placed above, `log` is still in its temporal dead zone, the getter
// throws, and unhead's own `entry` is left undefined. The resulting
// "entry is undefined" TypeError aborts setup before useAsyncData ever runs,
// so the page renders its not-found branch and no request is made.
useSeoMeta({
  title: () => (log.value ? `Editar: ${log.value.work.title}` : 'Editar registro'),
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

.book-data-state {
  padding: var(--space-4) 0;
  color: var(--text-color);
  font-size: var(--font-size-sm);
  text-align: center;
}

.book-details-section {
  margin-top: var(--space-8);
  padding-top: var(--space-6);
  border-top: 1px solid var(--input-bg);
}

.book-edit-warning {
  color: var(--text-color);
  font-size: var(--font-size-sm);
  margin: 0 0 var(--space-4) 0;
  line-height: var(--line-height-normal);
}

.book-details {
  border: 1px solid var(--input-bg);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  background-color: var(--bg-color);
}

.book-details-summary {
  font-family: var(--font-serif);
  font-size: var(--font-size-xl);
  color: #fff;
  cursor: pointer;
  padding: var(--space-1) 0;
}

.book-details-summary:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
}

.book-details-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--input-bg);
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
