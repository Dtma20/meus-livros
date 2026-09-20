<template>
  <NuxtLayout name="default">
    <div class="error-page-container">
      <EmptyState
        v-if="is404"
        icon="🔍"
        title="Não encontramos essa página."
        action-label="Ir para o início"
        action-href="/"
      />
      <ErrorState
        v-else
        title="Algo deu errado. Tente de novo."
        action-label="Tentar de novo"
        @retry="handleRetry"
      />
    </div>
  </NuxtLayout>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NuxtError } from '#app'
import EmptyState from '~/components/ui/EmptyState.vue'
import ErrorState from '~/components/ui/ErrorState.vue'

const props = defineProps<{
  error?: NuxtError | { statusCode?: number; statusMessage?: string; message?: string }
}>()

const is404 = computed(() => props.error?.statusCode === 404)

function handleRetry() {
  clearError()
}
</script>

<style scoped>
.error-page-container {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: var(--space-12, 48px) var(--space-4, 16px);
  width: 100%;
  box-sizing: border-box;
}
</style>
