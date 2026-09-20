<template>
  <div class="genre-picker">
    <div class="genre-picker-header">
      <span class="genre-count" :class="{ 'is-limit': isAtLimit }">
        {{ selectedIds.length }} de {{ max }} selecionados
      </span>
      <span v-if="isAtLimit" class="genre-limit-hint" role="status">
        (limite atingido)
      </span>
    </div>

    <div class="genre-groups">
      <div v-for="group in groups" :key="group.kind" class="genre-group">
        <span class="genre-group-title">{{ group.title }}</span>
        <div class="genre-pills" role="group" :aria-label="group.title">
          <button
            v-for="genre in group.items"
            :key="genre.id"
            type="button"
            class="genre-pill"
            :class="{
              'is-selected': isSelected(genre.id),
              'is-disabled': isDisabled(genre.id),
            }"
            :aria-pressed="isSelected(genre.id)"
            :disabled="disabled || isDisabled(genre.id)"
            @click="toggleGenre(genre.id)"
          >
            <span class="genre-pill-indicator" aria-hidden="true">
              {{ isSelected(genre.id) ? '✓' : '+' }}
            </span>
            <span class="genre-pill-label">{{ genre.label_pt }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { GENRES, type GenreItem } from '~~/shared/constants/genres'

const props = withDefaults(
  defineProps<{
    modelValue?: number[]
    max?: number
    disabled?: boolean
  }>(),
  {
    modelValue: () => [],
    max: 4,
    disabled: false,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: number[]): void
}>()

const selectedIds = computed(() => props.modelValue ?? [])
const isAtLimit = computed(() => selectedIds.value.length >= props.max)

function isSelected(id: number): boolean {
  return selectedIds.value.includes(id)
}

function isDisabled(id: number): boolean {
  return isAtLimit.value && !isSelected(id)
}

function toggleGenre(id: number): void {
  if (props.disabled) return

  if (isSelected(id)) {
    emit(
      'update:modelValue',
      selectedIds.value.filter((item) => item !== id),
    )
  } else if (!isAtLimit.value) {
    emit('update:modelValue', [...selectedIds.value, id])
  }
}

interface GenreGroup {
  kind: string
  title: string
  items: GenreItem[]
}

const groups = computed<GenreGroup[]>(() => [
  {
    kind: 'ficcao',
    title: 'Ficção',
    items: GENRES.filter((g) => g.kind === 'ficcao'),
  },
  {
    kind: 'nao_ficcao',
    title: 'Não Ficção',
    items: GENRES.filter((g) => g.kind === 'nao_ficcao'),
  },
  {
    kind: 'outro',
    title: 'Outros',
    items: GENRES.filter((g) => g.kind === 'outro'),
  },
])
</script>

<style scoped>
.genre-picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 100%;
}

.genre-picker-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-xs);
}

.genre-count {
  color: var(--text-color);
  font-weight: 500;
}

.genre-count.is-limit {
  color: var(--highlight);
}

.genre-limit-hint {
  color: var(--highlight);
  font-style: italic;
}

.genre-groups {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.genre-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.genre-group-title {
  margin: 0;
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-color);
  opacity: 0.8;
}

.genre-pills {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.genre-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  background-color: var(--input-bg);
  color: var(--text-color);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-full);
  padding: 6px var(--space-3);
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  cursor: pointer;
  transition: all 0.15s ease-in-out;
  user-select: none;
  touch-action: manipulation;
  min-height: 32px;
}

.genre-pill:hover:not(:disabled) {
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
}

.genre-pill:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.genre-pill.is-selected {
  background-color: var(--star-color);
  border-color: var(--star-color);
  color: #fff;
  font-weight: 600;
}

.genre-pill.is-disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.genre-pill-indicator {
  font-size: 11px;
  line-height: 1;
}

.genre-pill-label {
  line-height: 1.2;
}

@media (prefers-reduced-motion: reduce) {
  .genre-pill {
    transition: none;
  }
}
</style>
