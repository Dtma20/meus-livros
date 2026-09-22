<template>
  <div class="rating-input-container">
    <div
      class="rating-input"
      role="slider"
      tabindex="0"
      aria-label="Avaliação em estrelas"
      aria-valuemin="0"
      aria-valuemax="5"
      :aria-valuenow="modelValue ?? 0"
      :aria-valuetext="ariaValueText"
      :class="{ 'is-disabled': disabled }"
      @keydown="onKeydown"
      @mouseleave="onMouseLeave"
    >
      <svg class="rating-defs" aria-hidden="true" width="0" height="0">
        <defs>
          <clipPath :id="`half-clip-${uid}`">
            <rect x="0" y="0" width="12" height="24" />
          </clipPath>
        </defs>
      </svg>

      <div class="stars-track">
        <div
          v-for="star in 5"
          :key="star"
          class="star-wrapper"
        >
          <!-- Left half target (e.g. 0.5, 1.5, 2.5...) -->
          <button
            type="button"
            class="star-half star-half-left"
            :disabled="disabled"
            tabindex="-1"
            :aria-label="`${star - 0.5} estrelas`"
            @mouseover="onHover(star - 0.5)"
            @click="onClickRating(star - 0.5)"
          />

          <!-- Right half target (e.g. 1.0, 2.0, 3.0...) -->
          <button
            type="button"
            class="star-half star-half-right"
            :disabled="disabled"
            tabindex="-1"
            :aria-label="`${star} estrelas`"
            @mouseover="onHover(star)"
            @click="onClickRating(star)"
          />

          <!-- Visual Star -->
          <svg
            class="star-svg"
            viewBox="0 0 24 24"
            width="28"
            height="28"
            aria-hidden="true"
          >
            <!-- Background Empty Star -->
            <path
              d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
              class="star-empty"
            />

            <!-- Full Star Fill -->
            <path
              v-if="effectiveRating >= star"
              d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
              class="star-filled"
            />

            <!-- Half Star Fill -->
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

    <!-- Rating display value and clear button -->
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
  }>(),
  {
    modelValue: null,
    disabled: false,
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

function onHover(val: number): void {
  if (props.disabled) return
  hoverRating.value = val
}

function onMouseLeave(): void {
  hoverRating.value = null
}

function onClickRating(val: number): void {
  if (props.disabled) return
  // If clicking same rating again, allow keeping or toggling
  emit('update:modelValue', val)
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
  display: inline-flex;
  align-items: center;
  outline: none;
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-2);
  transition: box-shadow 0.15s ease-in-out;
}

.rating-input:focus-visible {
  outline: 2px solid var(--highlight);
  outline-offset: 2px;
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

.star-half {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 50%;
  height: 100%;
  background: transparent;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  z-index: 2;
  -webkit-tap-highlight-color: transparent;
}

.star-half-left {
  left: 0;
}

.star-half-right {
  right: 0;
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

@media (prefers-reduced-motion: reduce) {
  .rating-input,
  .clear-rating-btn {
    transition: none;
  }
}
</style>
