<template>
  <div class="log-page-container">
    <div class="log-page-card">
      <h1 class="page-title">Registrar livro</h1>
      <p class="page-desc">
        Registre uma nova leitura concluída com sua nota, data e resenha.
      </p>

      <div class="tabs-nav" role="tablist">
        <button
          type="button"
          role="tab"
          class="tab-btn"
          :class="{ active: activeTab === 'manual' }"
          :aria-selected="activeTab === 'manual'"
          @click="activeTab = 'manual'"
        >
          Registrar livro
        </button>
        <button
          type="button"
          role="tab"
          class="tab-btn"
          :class="{ active: activeTab === 'json' }"
          :aria-selected="activeTab === 'json'"
          @click="activeTab = 'json'"
        >
          Importar JSON
        </button>
      </div>

      <LogForm v-if="activeTab === 'manual'" mode="create" />
      <JsonImportSection v-else />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import LogForm from '~/components/log/LogForm.vue'
import JsonImportSection from '~/components/log/JsonImportSection.vue'

definePageMeta({
  layout: 'app',
  middleware: 'auth',
})

const activeTab = ref<'manual' | 'json'>('manual')

useSeoMeta({
  title: () => (activeTab.value === 'json' ? 'Importar JSON' : 'Registrar livro'),
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

.tabs-nav {
  display: flex;
  gap: var(--space-2, 8px);
  margin-bottom: var(--space-6, 24px);
  border-bottom: 1px solid var(--input-bg, #2c3440);
  padding-bottom: var(--space-2, 8px);
}

.tab-btn {
  background: transparent;
  border: none;
  color: var(--text-color, #9ab);
  font-family: inherit;
  font-size: var(--font-size-base, 1rem);
  font-weight: 500;
  padding: 8px 16px;
  cursor: pointer;
  border-radius: var(--radius-sm, 4px);
  transition: color 0.2s, background-color 0.2s;
}

.tab-btn:hover {
  color: #fff;
  background-color: rgba(255, 255, 255, 0.05);
}

.tab-btn.active {
  color: #fff;
  background-color: var(--input-bg, #2c3440);
}
</style>
