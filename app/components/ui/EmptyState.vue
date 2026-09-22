<template>
  <div class="empty-state" role="status">
    <div v-if="icon" class="empty-icon">
      {{ icon }}
    </div>
    <slot name="icon" />

    <component
      :is="headingTag || 'h2'"
      v-if="title || $slots.title"
      class="empty-title"
    >
      <slot name="title">
        {{ title }}
      </slot>
    </component>

    <p v-if="message" class="empty-message">
      {{ message }}
    </p>

    <slot />

    <div v-if="actionLabel || $slots.action" class="empty-action">
      <slot name="action">
        <a
          v-if="actionHref"
          :href="actionHref"
          class="empty-btn"
        >
          {{ actionLabel }}
        </a>
        <button
          v-else
          type="button"
          class="empty-btn"
          @click="$emit('action')"
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
    actionHref?: string
    headingTag?: 'h1' | 'h2' | 'h3' | 'h4'
  }>(),
  {
    title: '',
    message: '',
    icon: '',
    actionLabel: '',
    actionHref: '',
    headingTag: 'h2',
  },
)

defineEmits<{
  (e: 'action'): void
}>()
</script>

<style scoped>
.empty-state {
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
  border: 1px solid var(--input-bg, #2c3440);
  width: 100%;
  box-sizing: border-box;
}

.empty-icon {
  font-size: 2.5rem;
  margin-bottom: var(--space-3, 12px);
  line-height: 1;
}

.empty-title {
  color: #fff;
  font-size: var(--font-size-xl, 1.25rem);
  font-weight: 600;
  margin: 0 0 var(--space-2, 8px) 0;
}

.empty-message {
  color: var(--text-color, #9ab);
  font-size: var(--font-size-sm, 0.875rem);
  max-width: 480px;
  line-height: var(--line-height-normal, 1.5);
  margin: 0 0 var(--space-4, 16px) 0;
}

.empty-action {
  margin-top: var(--space-2, 8px);
}

.empty-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background-color: var(--highlight, #f59e0b);
  color: #000;
  font-weight: bold;
  font-size: var(--font-size-sm, 0.875rem);
  padding: 8px 16px;
  min-height: 44px;
  box-sizing: border-box;
  border-radius: var(--radius-sm, 4px);
  border: none;
  cursor: pointer;
  text-decoration: none;
  transition: opacity 0.2s;
}

.empty-btn:hover {
  opacity: 0.9;
}

.empty-btn:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .empty-btn {
    transition: none;
  }
}
</style>
