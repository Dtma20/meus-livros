<template>
  <div class="json-import-container">
    <div v-if="successSummary" class="success-card" role="alert">
      <div class="success-icon">✓</div>
      <h2 class="success-title">Importação concluída!</h2>
      <p class="success-text">
        <strong>{{ successSummary.imported }}</strong> livros foram adicionados com sucesso à sua biblioteca.
        <span v-if="successSummary.skipped > 0">
          ({{ successSummary.skipped }} ignorados ou com aviso).
        </span>
      </p>

      <div class="success-actions">
        <NuxtLink to="/" class="btn-primary">
          Ir para a Minha Biblioteca
        </NuxtLink>
        <button type="button" class="btn-secondary" @click="reset">
          Importar outro arquivo
        </button>
      </div>
    </div>

    <div v-else>
      <div
        class="drop-zone"
        :class="{ 'is-dragging': isDragging }"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="handleDrop"
      >
        <input
          ref="fileInputRef"
          type="file"
          accept=".json,application/json"
          class="file-input-hidden"
          @change="handleFileChange"
        >
        <div class="drop-content">
          <div class="drop-icon">📁</div>
          <p class="drop-instruction">
            Arraste seu arquivo <strong>.json</strong> aqui ou
          </p>
          <button type="button" class="btn-select-file" @click="triggerFileInput">
            Selecionar arquivo do computador
          </button>
          <span class="file-hint">Formato compatível com o backup de livros (livros.json)</span>
        </div>
      </div>

      <!-- Erro de parsing do cliente -->
      <div v-if="parseError" class="error-banner" role="alert">
        {{ parseError }}
      </div>

      <!-- Pré-visualização antes da importação -->
      <div v-if="previewBooks.length > 0" class="preview-section">
        <div class="preview-header">
          <h3 class="preview-title">
            {{ totalParsedBooks }} {{ totalParsedBooks === 1 ? 'livro encontrado' : 'livros encontrados' }}
          </h3>
          <span class="badge-valid">Pronto para importar</span>
        </div>

        <ul class="preview-list">
          <li v-for="(b, idx) in previewBooks" :key="idx" class="preview-item">
            <span class="preview-item-title">{{ b.title }}</span>
            <span class="preview-item-author">{{ b.author }}</span>
            <span v-if="b.year" class="preview-item-meta">({{ b.year }})</span>
            <span v-if="b.rate" class="preview-item-rate">★ {{ b.rate }}</span>
          </li>
        </ul>
        <p v-if="totalParsedBooks > previewBooks.length" class="more-hint">
          ... e mais {{ totalParsedBooks - previewBooks.length }} livros no arquivo.
        </p>

        <!-- Erro da API no envio -->
        <div v-if="apiError" class="error-banner mt-3" role="alert">
          {{ apiError }}
        </div>

        <div class="import-submit-bar">
          <button
            type="button"
            class="btn-primary btn-import"
            :disabled="isSubmitting"
            @click="submitImport"
          >
            <span v-if="isSubmitting">Importando livros...</span>
            <span v-else>Confirmar e importar {{ totalParsedBooks }} livros</span>
          </button>
          <button
            type="button"
            class="btn-cancel"
            :disabled="isSubmitting"
            @click="reset"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { LivroJson } from '~~/shared/schemas/export-import'

const isDragging = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const parseError = ref('')
const apiError = ref('')
const isSubmitting = ref(false)

const allParsedBooks = ref<LivroJson[]>([])
const previewBooks = ref<LivroJson[]>([])
const totalParsedBooks = ref(0)

const successSummary = ref<{ imported: number; skipped: number } | null>(null)

function triggerFileInput() {
  fileInputRef.value?.click()
}

function handleDrop(event: DragEvent) {
  isDragging.value = false
  const files = event.dataTransfer?.files
  if (files && files[0]) {
    readFile(files[0])
  }
}

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files && target.files[0]) {
    readFile(target.files[0])
  }
}

function readFile(file: File) {
  parseError.value = ''
  apiError.value = ''

  if (!file.name.endsWith('.json') && file.type !== 'application/json') {
    parseError.value = 'Por favor, selecione um arquivo no formato .json válido.'
    return
  }

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const text = e.target?.result as string
      const json = JSON.parse(text)
      const list: unknown = Array.isArray(json) ? json : json?.books

      if (!Array.isArray(list) || list.length === 0) {
        parseError.value = 'O arquivo JSON não contém uma lista de livros válida.'
        return
      }

      // Validação básica dos primeiros itens
      const validBooks: LivroJson[] = []
      for (const item of list) {
        if (item && typeof item === 'object' && typeof item.title === 'string' && typeof item.author === 'string') {
          validBooks.push(item as LivroJson)
        }
      }

      if (validBooks.length === 0) {
        parseError.value = 'Nenhum livro com "title" e "author" válidos foi encontrado no arquivo.'
        return
      }

      allParsedBooks.value = validBooks
      totalParsedBooks.value = validBooks.length
      previewBooks.value = validBooks.slice(0, 5)
    } catch {
      parseError.value = 'Não foi possível ler o arquivo. Verifique se a sintaxe do JSON está correta.'
    }
  }

  reader.readAsText(file)
}

async function submitImport() {
  if (allParsedBooks.value.length === 0 || isSubmitting.value) return

  isSubmitting.value = true
  apiError.value = ''

  try {
    const res = await $fetch<{ success: boolean; imported: number; skipped: number; errors: string[] }>('/api/library/import', {
      method: 'POST',
      body: {
        books: allParsedBooks.value,
      },
    })

    successSummary.value = {
      imported: res.imported,
      skipped: res.skipped,
    }
  } catch (err: unknown) {
    const msg = (err as { data?: { message?: string } })?.data?.message
      || 'Ocorreu um erro ao importar os livros. Tente novamente.'
    apiError.value = msg
  } finally {
    isSubmitting.value = false
  }
}

function reset() {
  parseError.value = ''
  apiError.value = ''
  isSubmitting.value = false
  allParsedBooks.value = []
  previewBooks.value = []
  totalParsedBooks.value = 0
  successSummary.value = null
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}
</script>

<style scoped>
.json-import-container {
  width: 100%;
}

.drop-zone {
  border: 2px dashed var(--input-bg, #2c3440);
  border-radius: var(--radius-md, 8px);
  padding: var(--space-8, 32px) var(--space-4, 16px);
  text-align: center;
  background-color: rgba(255, 255, 255, 0.02);
  transition: border-color 0.2s, background-color 0.2s;
  cursor: pointer;
}

.drop-zone.is-dragging,
.drop-zone:hover {
  border-color: var(--highlight, #00e054);
  background-color: rgba(0, 224, 84, 0.04);
}

.file-input-hidden {
  display: none;
}

.drop-icon {
  font-size: 2.5rem;
  margin-bottom: var(--space-2, 8px);
}

.drop-instruction {
  color: #fff;
  font-size: var(--font-size-base, 1rem);
  margin: 0 0 var(--space-3, 12px) 0;
}

.btn-select-file {
  background-color: var(--card-bg, #1e242b);
  border: 1px solid var(--highlight, #00e054);
  color: var(--highlight, #00e054);
  padding: 8px 16px;
  border-radius: var(--radius-sm, 4px);
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;
}

.btn-select-file:hover {
  background-color: var(--highlight, #00e054);
  color: #14181c;
}

.file-hint {
  display: block;
  font-size: var(--font-size-xs, 0.75rem);
  color: var(--text-color, #9ab);
  margin-top: var(--space-3, 12px);
}

.error-banner {
  background-color: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #fca5a5;
  padding: 12px 16px;
  border-radius: var(--radius-sm, 4px);
  font-size: var(--font-size-sm, 0.875rem);
  margin-top: 16px;
}

.preview-section {
  margin-top: var(--space-6, 24px);
  background-color: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--input-bg, #2c3440);
  border-radius: var(--radius-md, 8px);
  padding: var(--space-6, 24px);
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4, 16px);
  padding-bottom: var(--space-2, 8px);
  border-bottom: 1px solid var(--input-bg, #2c3440);
}

.preview-title {
  font-size: var(--font-size-base, 1rem);
  color: #fff;
  margin: 0;
}

.badge-valid {
  background-color: rgba(0, 224, 84, 0.15);
  color: #3fb950;
  font-size: var(--font-size-xs, 0.75rem);
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 4px;
}

.preview-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-sm, 0.875rem);
  padding: 6px 10px;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  overflow: hidden;
}

.preview-item-title {
  color: #fff;
  font-weight: 500;
}

.preview-item-author {
  color: var(--text-color, #9ab);
}

.preview-item-meta {
  color: #6e7681;
  font-size: var(--font-size-xs, 0.75rem);
}

.preview-item-rate {
  margin-left: auto;
  color: #e3b341;
  font-weight: 600;
}

.more-hint {
  font-size: var(--font-size-xs, 0.75rem);
  color: var(--text-color, #9ab);
  margin-top: 10px;
  margin-bottom: 0;
  font-style: italic;
}

.import-submit-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
}

.btn-import {
  flex: 1;
}

.btn-cancel {
  background: transparent;
  border: 1px solid var(--input-bg, #2c3440);
  color: var(--text-color, #9ab);
  padding: 8px 16px;
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
}

.btn-cancel:hover {
  color: #fff;
}

.success-card {
  text-align: center;
  padding: var(--space-8, 32px) var(--space-4, 16px);
  background-color: rgba(0, 224, 84, 0.04);
  border: 1px solid rgba(0, 224, 84, 0.2);
  border-radius: var(--radius-md, 8px);
}

.success-icon {
  width: 48px;
  height: 48px;
  line-height: 48px;
  border-radius: 50%;
  background-color: #3fb950;
  color: #14181c;
  font-size: 1.5rem;
  font-weight: bold;
  margin: 0 auto 16px auto;
}

.success-title {
  color: #fff;
  font-size: var(--font-size-xl, 1.25rem);
  margin: 0 0 8px 0;
}

.success-text {
  color: var(--text-color, #9ab);
  font-size: var(--font-size-base, 1rem);
  margin-bottom: 24px;
}

.success-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.btn-secondary {
  background-color: var(--card-bg, #1e242b);
  border: 1px solid var(--text-color, #9ab);
  color: #fff;
  padding: 8px 16px;
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  text-decoration: none;
}
</style>
