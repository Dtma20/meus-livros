<template>
  <div class="edition-options" role="group" aria-label="Edições disponíveis">
    <label class="edition-option" :class="{ 'is-selected': modelValue === null }">
      <input
        type="radio"
        name="edition"
        :checked="modelValue === null"
        :value="null"
        :disabled="disabled"
        @change="emit('update:modelValue', null)"
      >
      <div class="edition-info">
        <span class="edition-title">Edição padrão do catálogo</span>
      </div>
    </label>

    <label
      v-for="edition in editions"
      :key="edition.id"
      class="edition-option"
      :class="{ 'is-selected': modelValue === edition.id }"
    >
      <input
        type="radio"
        name="edition"
        :checked="modelValue === edition.id"
        :value="edition.id"
        :disabled="disabled"
        @change="emit('update:modelValue', edition.id)"
      >
      <div class="edition-info">
        <span class="edition-title">
          {{ edition.publisher || 'Editora não informada' }}
          <span v-if="edition.published_year">({{ edition.published_year }})</span>
        </span>
        <span v-if="edition.isbn13" class="edition-meta">ISBN: {{ edition.isbn13 }}</span>
        <span v-if="edition.page_count" class="edition-meta">{{ edition.page_count }} páginas</span>
      </div>
    </label>
  </div>
</template>

<script setup lang="ts">
import type { LogEditionView } from '~~/shared/schemas/log'

defineProps<{
  editions: LogEditionView[]
  modelValue: string | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [editionId: string | null]
}>()
</script>

<style scoped>
.edition-options {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.edition-option {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background-color: var(--input-bg);
  cursor: pointer;
  border: 1px solid transparent;
}

.edition-option.is-selected {
  border-color: var(--highlight);
}

.edition-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.edition-title {
  font-size: var(--font-size-sm);
  color: #fff;
}

.edition-meta {
  font-size: var(--font-size-xs);
  color: var(--text-color);
}
</style>
