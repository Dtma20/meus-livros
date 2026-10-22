<template>
  <div
    class="app-logo-wrapper"
    :class="{ 'with-text': showText, 'with-badge': badge }"
    :style="{ '--logo-size': `${resolvedSize}px` }"
  >
    <img
      class="app-logo-icon"
      :src="logoImage.src"
      :srcset="logoImage.srcset"
      :width="resolvedSize"
      :height="resolvedSize"
      alt=""
      decoding="async"
    >

    <span v-if="showText" class="logo-text paper-text origami-text">
      Livrolas
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    size?: number | string
    showText?: boolean
    badge?: boolean
  }>(),
  {
    size: 28,
    showText: false,
    badge: false,
  },
)

const resolvedSize = computed(() => {
  if (typeof props.size === 'number') return props.size
  const parsed = parseInt(props.size, 10)
  return Number.isNaN(parsed) ? 28 : parsed
})

const logoImage = computed(() => {
  const size = resolvedSize.value
  if (size <= 32) {
    return { src: '/brand/logo-48.png', srcset: '/brand/logo-48.png 1x, /brand/logo-96.png 2x' }
  }
  if (size <= 44) {
    return { src: '/brand/logo-48.png', srcset: '/brand/logo-48.png 1x, /brand/logo-88.png 2x' }
  }
  return { src: '/brand/logo-96.png', srcset: '/brand/logo-96.png 1x, /brand/logo-512.png 2x' }
})
</script>

<style scoped>
.app-logo-wrapper {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  vertical-align: middle;
  line-height: 1;
}

.app-logo-icon {
  display: block;
  flex-shrink: 0;
}

.logo-text {
  font-family: var(--font-serif);
  font-weight: 600;
  color: var(--text-bright);
  letter-spacing: -0.01em;
  font-size: var(--font-size-xl);
  background-color: currentColor;
  background-image: url('/landing/paper-512.webp');
  background-size: 256px 256px;
  background-position: center;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

@media (forced-colors: active) {
  .logo-text {
    -webkit-text-fill-color: currentColor;
    background: none;
  }
}

@supports not ((-webkit-background-clip: text) or (background-clip: text)) {
  .logo-text {
    -webkit-text-fill-color: currentColor;
    background: none;
  }
}
</style>
