<template>
  <div class="error-state" role="alert">
    <div v-if="icon" class="error-icon" aria-hidden="true">
      {{ icon }}
    </div>
    <slot name="icon" />

    <component
      :is="headingTag || 'h2'"
      class="error-title"
    >
      <slot name="title">
        {{ title }}
      </slot>
    </component>

    <p v-if="message || $slots.default" class="error-message">
      <slot>
        {{ message }}
      </slot>
    </p>

    <div v-if="actionLabel || $slots.action" class="error-action">
      <slot name="action">
        <button
          type="button"
          class="error-btn"
          @click="$emit('retry')"
        >
          {{ actionLabel }}
        </button>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    message?: string
    icon?: string
    actionLabel?: string
    headingTag?: 'h1' | 'h2' | 'h3' | 'h4'
  }>(),
  {
    title: 'Algo deu errado. Tente de novo.',
    message: '',
    icon: '',
    actionLabel: 'Tentar de novo',
    headingTag: 'h2',
  },
)

defineEmits<{
  (e: 'retry'): void
}>()
</script>

<style scoped>
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--space-8, 32px) var(--space-4, 16px);
  margin: var(--space-6, 24px) 0;
  border-radius: var(--radius-md, 8px);
  background-color: var(--card-bg, #232a31);
  color: var(--text-color, #9ab);
  border: 1px solid var(--danger, #ef4444);
  width: 100%;
  box-sizing: border-box;
}

.error-icon {
  font-size: 2rem;
  margin-bottom: var(--space-3, 12px);
  line-height: 1;
}

.error-title {
  color: #fff;
  font-size: var(--font-size-xl, 1.25rem);
  font-weight: 600;
  margin: 0 0 var(--space-2, 8px) 0;
}

.error-message {
  color: var(--text-color, #9ab);
  font-size: var(--font-size-sm, 0.875rem);
  max-width: 480px;
  line-height: var(--line-height-normal, 1.5);
  margin: 0 0 var(--space-4, 16px) 0;
}

.error-action {
  margin-top: var(--space-2, 8px);
}

.error-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background-color: var(--input-bg, #2c3440);
  color: #fff;
  font-weight: 600;
  font-size: var(--font-size-sm, 0.875rem);
  padding: 8px 16px;
  min-height: 44px;
  box-sizing: border-box;
  border-radius: var(--radius-sm, 4px);
  border: 1px solid var(--text-color, #9ab);
  cursor: pointer;
  text-decoration: none;
  transition: border-color 0.2s, background-color 0.2s;
}

.error-btn:hover {
  border-color: #fff;
  background-color: var(--card-bg, #232a31);
}

.error-btn:focus-visible {
  outline: 2px solid var(--highlight, #40bcf4);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .error-btn {
    transition: none;
  }
}
</style>
