<template>
  <div class="rating-input-container">
    <div
      class="rating-input"
      :class="{ 'is-disabled': disabled }"
    >
      <input
        class="rating-slider"
        type="range"
        role="slider"
        min="0"
        max="5"
        step="0.5"
        :value="modelValue ?? 0"
        :disabled="disabled"
        :tabindex="disabled ? -1 : 0"
        aria-valuemin="0"
        aria-valuemax="5"
        :aria-valuenow="modelValue ?? 0"
        :aria-valuetext="ariaValueText"
        :aria-labelledby="labelledBy || undefined"
        :aria-label="labelledBy ? undefined : 'Avaliação em estrelas'"
        @input="onPointerInput"
        @keydown="onKeydown"
        @pointermove="onPointerMove"
        @pointerleave="onMouseLeave"
      >
      <svg class="rating-defs" aria-hidden="true" width="0" height="0">
        <defs>
          <clipPath :id="`half-clip-${uid}`">
            <rect x="0" y="0" width="12" height="24" />
          </clipPath>
        </defs>
      </svg>

      <div class="stars-track" aria-hidden="true">
        <div
          v-for="star in 5"
          :key="star"
          class="star-wrapper"
        >
          <svg
            class="star-svg"
            viewBox="0 0 24 24"
            width="28"
            height="28"
            aria-hidden="true"
          >
            <path
              d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
              class="star-empty"
            />

            <path
              v-if="effectiveRating >= star"
              d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
              class="star-filled"
            />

            <path
              v-else-if="effectiveRating >= star - 0.5"
              d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
              class="star-filled"
              :clip-path="`url(#half-clip-${uid})`"
            />
          </svg>
        </div>
      </div>
    </div>

    <div class="rating-meta">
      <span class="rating-label">{{ ratingDisplayLabel }}</span>
      <button
        v-if="modelValue != null && !disabled"
        type="button"
        class="clear-rating-btn"
        title="Remover nota"
        @click="clearRating"
      >
        Limpar
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue?: number | null
    disabled?: boolean
    labelledBy?: string
  }>(),
  {
    modelValue: null,
    disabled: false,
    labelledBy: undefined,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: number | null): void
}>()

const uid = useId().replace(/:/g, '')
const hoverRating = ref<number | null>(null)

const effectiveRating = computed(() => {
  if (hoverRating.value !== null) return hoverRating.value
  return props.modelValue ?? 0
})

const ariaValueText = computed(() => {
  if (props.modelValue == null) return 'Sem avaliação'
  const formatted = String(props.modelValue).replace('.', ',')
  return `${formatted} de 5 estrelas`
})

const ratingDisplayLabel = computed(() => {
  const r = hoverRating.value !== null ? hoverRating.value : props.modelValue
  if (r == null || r <= 0) return 'Sem nota'
  const formatted = String(r).replace('.', ',')
  return `${formatted} ★`
})

function onMouseLeave(): void {
  hoverRating.value = null
}

function onPointerInput(e: Event): void {
  if (props.disabled) return
  const target = e.currentTarget
  if (!(target instanceof HTMLInputElement)) return
  hoverRating.value = null
  emit('update:modelValue', target.valueAsNumber > 0 ? target.valueAsNumber : null)
}

function onPointerMove(e: PointerEvent): void {
  if (props.disabled) return
  const target = e.currentTarget
  if (!(target instanceof HTMLInputElement)) return
  const bounds = target.getBoundingClientRect()
  if (bounds.width <= 0) return
  const progress = Math.max(0, Math.min(1, (e.clientX - bounds.left) / bounds.width))
  hoverRating.value = Math.round(progress * 10) / 2
}

function clearRating(): void {
  if (props.disabled) return
  hoverRating.value = null
  emit('update:modelValue', null)
}

function onKeydown(e: KeyboardEvent): void {
  if (props.disabled) return

  const current = props.modelValue ?? 0

  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (props.modelValue == null) {
      emit('update:modelValue', 0.5)
    } else {
      const next = Math.min(5.0, Math.round((current + 0.5) * 2) / 2)
      emit('update:modelValue', next)
    }
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
    e.preventDefault()
    if (props.modelValue == null || current <= 0.5) {
      emit('update:modelValue', null)
    } else {
      const prev = Math.max(0.5, Math.round((current - 0.5) * 2) / 2)
      emit('update:modelValue', prev)
    }
  } else if (e.key === 'Home') {
    e.preventDefault()
    emit('update:modelValue', 0.5)
  } else if (e.key === 'End') {
    e.preventDefault()
    emit('update:modelValue', 5.0)
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    emit('update:modelValue', null)
  }
}
</script>

<style scoped>
.rating-input-container {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.rating-input {
  position: relative;
  display: inline-flex;
  align-items: center;
  outline: none;
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-2);
  box-sizing: content-box;
  transition: box-shadow 0.15s ease-in-out;
}

.rating-input:has(.rating-slider:focus-visible) {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.rating-input.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.rating-defs {
  position: absolute;
  pointer-events: none;
}

.rating-slider {
  position: absolute;
  top: var(--space-1);
  left: var(--space-2);
  width: calc(100% - var(--space-2) - var(--space-2));
  height: calc(100% - var(--space-1) - var(--space-1));
  margin: 0;
  padding: 0;
  opacity: 0;
  appearance: none;
  cursor: pointer;
  z-index: 2;
}

.rating-slider:disabled {
  cursor: not-allowed;
}

.rating-slider::-webkit-slider-runnable-track {
  height: 100%;
  background: transparent;
}

.rating-slider::-webkit-slider-thumb {
  width: 1px;
  height: 100%;
  appearance: none;
  background: transparent;
}

.rating-slider::-moz-range-track {
  height: 100%;
  background: transparent;
}

.rating-slider::-moz-range-thumb {
  width: 1px;
  height: 100%;
  border: 0;
  background: transparent;
}

.stars-track {
  display: flex;
  align-items: center;
  gap: 4px;
}

.star-wrapper {
  position: relative;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.star-svg {
  width: 28px;
  height: 28px;
  pointer-events: none;
  display: block;
}

.star-empty {
  fill: var(--input-bg, #2c3440);
  stroke: rgba(255, 255, 255, 0.2);
  stroke-width: 1px;
}

.star-filled {
  fill: var(--star-color, #f59e0b);
}

.rating-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.rating-label {
  font-size: var(--font-size-sm);
  color: var(--text-color);
  min-width: 60px;
  font-weight: 500;
}

.clear-rating-btn {
  background: transparent;
  border: 1px solid var(--input-bg);
  border-radius: var(--radius-sm);
  color: var(--text-color);
  font-size: var(--font-size-xs);
  padding: 4px 8px;
  min-height: 28px;
  cursor: pointer;
  transition: all 0.15s;
}

.clear-rating-btn:hover {
  background: var(--input-bg);
  color: #fff;
  border-color: var(--text-color);
}

.clear-rating-btn:focus-visible {
  outline: 2px solid var(--highlight);
  outline-offset: 2px;
}

@media (hover: none), (pointer: coarse) {
  .stars-track {
    gap: 0;
  }

  .star-wrapper {
    width: var(--target-min-size);
    height: var(--target-min-size);
  }

  .clear-rating-btn {
    min-width: var(--target-min-size);
    min-height: var(--target-min-size);
  }
}

@media (prefers-reduced-motion: reduce) {
  .rating-input,
  .clear-rating-btn {
    transition: none;
  }
}
</style>
