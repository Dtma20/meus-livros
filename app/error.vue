<template>
  <NuxtLayout name="default">
    <div class="error-container">
      <h1 class="error-code">
        {{ is404 ? '404' : 'Erro' }}
      </h1>
      <h2 class="error-title">
        {{ is404 ? 'Página não encontrada' : 'Ocorreu um erro no servidor' }}
      </h2>
      <p class="error-message">
        {{ is404 ? 'A página que você procura não existe ou foi removida.' : 'Não foi possível processar a requisição. Tente novamente mais tarde.' }}
      </p>
      <NuxtLink to="/" class="error-link" @click.prevent="handleClearError">
        Voltar ao início
      </NuxtLink>
    </div>
  </NuxtLayout>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NuxtError } from '#app'

const props = defineProps<{
  error?: NuxtError | { statusCode?: number; statusMessage?: string; message?: string }
}>()

const is404 = computed(() => props.error?.statusCode === 404)

function handleClearError() {
  clearError({ redirect: '/' })
}
</script>

<style scoped>
.error-container {
  text-align: center;
  padding: var(--space-12) var(--space-4);
}

.error-code {
  font-size: var(--font-size-3xl);
  color: var(--highlight);
  margin-bottom: var(--space-2);
}

.error-title {
  font-size: var(--font-size-xl);
  color: #fff;
  margin-bottom: var(--space-4);
}

.error-message {
  color: var(--text-color);
  font-size: var(--font-size-base);
  margin-bottom: var(--space-6);
  max-width: 480px;
  margin-left: auto;
  margin-right: auto;
}

.error-link {
  display: inline-block;
  background-color: var(--input-bg);
  color: #fff;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-sm);
  text-decoration: none;
  border: 1px solid var(--text-color);
  transition: border-color 0.2s, background-color 0.2s;
}

.error-link:hover {
  border-color: #fff;
  background-color: var(--card-bg);
}

.error-link:focus-visible {
  outline: 2px solid var(--highlight);
  outline-offset: 2px;
}
</style>
