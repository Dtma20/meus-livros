<template>
  <dialog
    ref="dialogRef"
    class="shortcuts-dialog"
    aria-labelledby="shortcuts-title"
    @close="onClose"
    @click="onBackdropClick"
  >
    <div class="shortcuts-body">
      <h2 id="shortcuts-title" class="shortcuts-title">
        Atalhos de teclado
      </h2>
      <ul class="shortcuts-list">
        <li v-for="item in items" :key="item.label">
          <span>{{ item.label }}</span>
          <span class="shortcuts-keys">
            <template v-for="(key, i) in item.keys" :key="key">
              <span v-if="i > 0" class="shortcuts-then">depois</span>
              <kbd>{{ key }}</kbd>
            </template>
          </span>
        </li>
      </ul>
      <p class="shortcuts-note">
        Pressione <kbd>?</kbd> a qualquer momento para ver esta lista de novo.
      </p>
      <button type="button" class="btn btn-secondary shortcuts-close" @click="close">
        Fechar
      </button>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const items = [
  { keys: ['/'], label: 'Buscar livros' },
  { keys: ['n'], label: 'Registrar leitura' },
  { keys: ['g', 'i'], label: 'Ir para Início' },
  { keys: ['g', 'a'], label: 'Ir para Atividade' },
  { keys: ['g', 'm'], label: 'Ir para Membros' },
  { keys: ['g', 'p'], label: 'Ir para Perfil' },
  { keys: ['?'], label: 'Mostrar esta lista' },
]

const dialogRef = ref<HTMLDialogElement | null>(null)
let previouslyFocused: HTMLElement | null = null

function open(): void {
  const dialog = dialogRef.value
  if (!dialog || dialog.open) return
  previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
  dialog.showModal()
}

function close(): void {
  dialogRef.value?.close()
}

function onClose(): void {
  previouslyFocused?.focus()
  previouslyFocused = null
}

function onBackdropClick(e: MouseEvent): void {
  if (e.target === dialogRef.value) close()
}

defineExpose({ open })
</script>

<style scoped>
.shortcuts-dialog {
  background-color: var(--bg-color);
  color: var(--text-color);
  border: 1px solid var(--input-bg);
  border-radius: var(--radius-md);
  padding: 0;
  width: min(420px, calc(100vw - 2 * var(--space-4)));
}

.shortcuts-dialog::backdrop {
  background-color: rgba(0, 0, 0, 0.6);
}

.shortcuts-body {
  padding: var(--space-6);
}

.shortcuts-title {
  margin: 0 0 var(--space-4);
  font-family: var(--font-serif);
  font-size: var(--font-size-xl);
  font-weight: 600;
  color: var(--text-bright);
}

.shortcuts-list {
  list-style: none;
  margin: 0 0 var(--space-5);
  padding: 0;
  display: grid;
  gap: var(--space-2);
}

.shortcuts-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  font-size: var(--font-size-sm);
}

.shortcuts-note {
  margin: 0 0 var(--space-4);
  font-size: var(--font-size-sm);
}

.shortcuts-keys {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.shortcuts-then {
  font-size: var(--font-size-xs);
}

kbd {
  font-family: var(--font-sans);
  font-variant-numeric: tabular-nums;
  font-size: var(--font-size-xs);
  min-width: 1.75em;
  text-align: center;
  padding: 2px var(--space-2);
  background-color: var(--card-bg);
  border: 1px solid var(--input-bg);
  border-radius: var(--radius-sm);
  color: var(--text-bright);
}

.shortcuts-close {
  /* Inherits from .btn.btn-secondary */
}
</style>
