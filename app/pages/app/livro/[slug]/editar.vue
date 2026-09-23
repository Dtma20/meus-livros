<template>
  <div class="edit-page">
    <div v-if="pending" class="state-block">
      <p>Carregando livro…</p>
    </div>

    <div v-else-if="error || !work" class="state-block">
      <ErrorState
        title="Livro não encontrado."
        message="Ele pode ter sido removido, ou o endereço está errado."
      />
      <NuxtLink to="/" class="back-link">← Voltar para o início</NuxtLink>
    </div>

    <template v-else>
      <header class="edit-header">
        <NuxtLink :to="`/livro/${work.slug}`" class="back-link">← Voltar para o livro</NuxtLink>
        <h1 class="page-title">Editar livro</h1>
        <p class="page-desc">
          O catálogo é compartilhado: qualquer pessoa do grupo pode corrigir este livro, e fica
          registrado quem alterou por último. O endereço do livro não muda quando o título muda.
        </p>
      </header>

      <section class="edit-section">
        <h2 class="section-title">Dados do livro</h2>
        <WorkEditForm :work="work" @saved="refresh()" />
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
            @saved="refresh()"
            @deleted="refresh()"
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

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import EditionEditor from '~/components/book/EditionEditor.vue'
import WorkEditForm from '~/components/book/WorkEditForm.vue'
import ErrorState from '~/components/ui/ErrorState.vue'
import type { WorkWithDetails } from '~~/shared/schemas/work'

definePageMeta({
  layout: 'app',
  middleware: 'auth',
})

const route = useRoute()
const slug = computed(() => (route.params.slug as string) || '')

const addingEdition = ref(false)

// Not awaited, for the same reason the log edit page does not await: a
// top-level await makes <script setup> async, which needs a Suspense boundary
// and turns the `v-if="pending"` branch into dead code.
const { data: work, pending, error, refresh } = useAsyncData<WorkWithDetails>(
  () => `work-edit-${slug.value}`,
  () =>
    $fetch<WorkWithDetails>(`/api/works/${encodeURIComponent(slug.value)}` as string, {
      timeout: 15_000,
      retry: 0,
    }),
  { watch: [slug] },
)

async function onEditionAdded(): Promise<void> {
  addingEdition.value = false
  await refresh()
}

useSeoMeta({
  title: () => (work.value ? `Editar: ${work.value.title}` : 'Editar livro'),
  // An edit screen has nothing to offer a crawler, and the work page it edits
  // is the canonical public surface.
  robots: 'noindex, nofollow',
})
</script>

<style scoped>
.edit-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  max-width: 760px;
  margin: 0 auto;
  padding: var(--space-4) 0;
  width: 100%;
  min-width: 0;
}

.edit-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.page-title {
  font-family: var(--font-serif);
  font-size: var(--font-size-3xl);
  color: #fff;
  margin: 0;
}

.page-desc,
.section-desc {
  color: var(--text-color);
  font-size: var(--font-size-sm);
  margin: 0;
}

.edit-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  background-color: var(--card-bg);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
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

.back-link {
  color: var(--text-color);
  text-decoration: none;
  font-size: var(--font-size-sm);
  align-self: flex-start;
}

.back-link:hover {
  color: var(--highlight);
}

.state-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  align-items: flex-start;
  color: var(--text-color);
}

@media (max-width: 600px) {
  .edit-section {
    padding: var(--space-4);
  }
}
</style>
