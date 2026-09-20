<template>
  <div class="log-page-container">
    <div class="log-page-card">
      <h1 class="page-title">Registrar livro</h1>
      <p class="page-desc">
        Registre uma nova leitura concluída com sua nota, data e resenha.
      </p>

      <LogForm mode="create" />
    </div>
  </div>
</template>

<script setup lang="ts">
import LogForm from '~/components/log/LogForm.vue'

definePageMeta({
  layout: 'app',
  middleware: 'auth',
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
</style>
