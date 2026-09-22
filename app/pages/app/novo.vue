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

/* Same segmented control as .visibility-nav on the profile page. */
.tabs-nav {
  display: inline-flex;
  background-color: var(--card-bg, #232a31);
  padding: var(--space-1, 4px);
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--input-bg, #2c3440);
  gap: var(--space-1, 4px);
  flex-wrap: wrap;
  margin-bottom: var(--space-6, 24px);
}

.tab-btn {
  background: none;
  border: none;
  color: var(--text-color, #9ab);
  font-family: inherit;
  font-size: var(--font-size-sm, 0.875rem);
  font-weight: 500;
  padding: var(--space-2, 8px) var(--space-3, 12px);
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  transition: color 0.2s, background-color 0.2s;
}

.tab-btn:hover:not(.active) {
  color: #fff;
}

.tab-btn.active {
  background-color: var(--highlight, #f59e0b);
  color: #14181c;
  font-weight: 700;
}

.tab-btn:focus-visible {
  outline: var(--focus-ring-width, 2px) solid var(--focus-ring-color, #f59e0b);
  outline-offset: var(--focus-ring-offset, 2px);
}

@media (prefers-reduced-motion: reduce) {
  .tab-btn {
    transition: none;
  }
}
</style>
