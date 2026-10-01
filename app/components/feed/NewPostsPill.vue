<template>
  <div class="new-posts-pill-container" aria-live="polite">
    <Transition name="pill-fade">
      <button
        v-if="visible"
        type="button"
        class="new-posts-pill"
        :aria-label="ariaLabelText"
        @click="$emit('click')"
      >
        <span class="pill-arrow" aria-hidden="true">↑</span>
        <span class="pill-text">{{ labelText }}</span>
        <span v-if="count && count > 1" class="pill-badge" aria-hidden="true">
          {{ count }}
        </span>
      </button>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    visible?: boolean
    count?: number
    label?: string
    ariaLabel?: string
  }>(),
  {
    visible: false,
    count: 0,
    label: 'Novas atividades no grupo',
    ariaLabel: undefined,
  },
)

defineEmits<{
  (e: 'click'): void
}>()

const labelText = computed(() => props.label || 'Novas atividades no grupo')

const ariaLabelText = computed(() => {
  if (props.ariaLabel) return props.ariaLabel
  if (props.count && props.count > 1) {
    return `${props.count} novas atividades no grupo disponíveis. Clique para carregar e rolar para o topo.`
  }
  return 'Novas atividades no grupo disponíveis. Clique para carregar e rolar para o topo.'
})
</script>

<style scoped>
.new-posts-pill-container {
  position: sticky;
  top: var(--space-4);
  z-index: 25;
  display: flex;
  justify-content: center;
  align-items: center;
  pointer-events: none;
  height: 0;
  margin: 0;
  padding: 0;
}

.new-posts-pill {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 38px;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-sm);
  background-color: rgba(35, 42, 49, 0.88);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(245, 158, 11, 0.4);
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.35),
    0 0 10px rgba(245, 158, 11, 0.15);
  color: var(--text-bright);
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  font-weight: 600;
  line-height: 1;
  text-decoration: none;
  cursor: pointer;
  user-select: none;
  outline: none;
  transition:
    transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
    background-color 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    color 0.2s ease;
  will-change: transform, opacity;
}

.new-posts-pill:hover {
  background-color: rgba(44, 52, 64, 0.95);
  border-color: var(--highlight);
  color: #fff;
  transform: translateY(-2px);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.45),
    0 0 16px var(--highlight-glow);
}

.new-posts-pill:active {
  transform: translateY(1px) scale(0.98);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.4),
    0 0 8px var(--highlight-soft);
  transition-duration: 0.08s;
}

.new-posts-pill:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.pill-arrow {
  display: inline-block;
  color: var(--highlight);
  font-size: var(--font-size-base);
  font-weight: 700;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.new-posts-pill:hover .pill-arrow {
  transform: translateY(-1px);
}

.pill-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 var(--space-1);
  font-size: var(--font-size-xs);
  font-weight: 700;
  border-radius: var(--radius-full);
  background-color: var(--highlight-soft);
  color: var(--highlight);
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.pill-fade-enter-active {
  transition:
    opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.pill-fade-leave-active {
  transition:
    opacity 0.2s ease-in,
    transform 0.2s ease-in;
}

.pill-fade-enter-from,
.pill-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
}

@media (pointer: coarse) {
  .new-posts-pill {
    min-height: var(--target-min-size);
    padding: var(--space-2) var(--space-5);
  }
}

@media (prefers-reduced-motion: reduce) {
  .new-posts-pill,
  .pill-fade-enter-active,
  .pill-fade-leave-active,
  .pill-arrow {
    transition: none !important;
    animation: none !important;
    transform: none !important;
  }
  .new-posts-pill:hover,
  .new-posts-pill:active,
  .new-posts-pill:hover .pill-arrow {
    transform: none !important;
  }
}
</style>
