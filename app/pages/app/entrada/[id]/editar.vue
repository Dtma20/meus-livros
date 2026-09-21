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
        <NuxtLink to="/app" class="back-link">← Voltar para o início</NuxtLink>
      </div>

      <LogForm
        v-else
        mode="edit"
        :initial-log="log"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import LogForm from '~/components/log/LogForm.vue'
import type { LogWithDetails } from '~~/shared/schemas/log'

definePageMeta({
  layout: 'app',
  middleware: 'auth',
})

const route = useRoute()
const id = computed(() => route.params.id as string)

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
</style>
