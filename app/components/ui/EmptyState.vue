<template>
  <div class="empty-state" role="status">
    <div v-if="icon" class="empty-icon" aria-hidden="true">
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
          class="btn btn-primary empty-btn"
        >
          {{ actionLabel }}
        </a>
        <button
          v-else
          type="button"
          class="btn btn-primary empty-btn"
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
  text-wrap: balance;
}

.empty-message {
  color: var(--text-color, #9ab);
  font-size: var(--font-size-sm, 0.875rem);
  max-width: 480px;
  line-height: var(--line-height-normal, 1.5);
  margin: 0 0 var(--space-4, 16px) 0;
  text-wrap: pretty;
}

.empty-action {
  margin-top: var(--space-4, 16px);
}
</style>
