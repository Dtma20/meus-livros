<template>
  <div
    class="app-logo-wrapper"
    :class="{ 'with-text': showText, 'with-badge': badge }"
    :style="{ '--logo-size': `${resolvedSize}px` }"
  >
    <svg
      class="app-logo-icon"
      :width="resolvedSize"
      :height="resolvedSize"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <!-- Optional subtle squircle badge backdrop -->
      <rect
        v-if="badge"
        x="1"
        y="1"
        width="46"
        height="46"
        rx="12"
        class="logo-badge-bg"
      />

      <!-- Left page with gentle curve -->
      <path
        d="M24 37C18.5 34.5 12 34.5 8 36V13C12 11.5 18.5 11.5 24 14V37Z"
        fill="url(#logoLeftPageGrad)"
        class="logo-page-left"
      />

      <!-- Right page with gentle curve -->
      <path
        d="M24 37C29.5 34.5 36 34.5 40 36V13C36 11.5 29.5 11.5 24 14V37Z"
        fill="url(#logoRightPageGrad)"
        class="logo-page-right"
      />

      <!-- Decorative page lines left -->
      <path
        d="M12 19C15.5 18.2 19 18.5 21 19.5"
        stroke="#ffffff"
        stroke-opacity="0.4"
        stroke-width="1.5"
        stroke-linecap="round"
      />
      <path
        d="M12 24C15.5 23.2 19 23.5 21 24.5"
        stroke="#ffffff"
        stroke-opacity="0.4"
        stroke-width="1.5"
        stroke-linecap="round"
      />
      <path
        d="M12 29C15.5 28.2 19 28.5 21 29.5"
        stroke="#ffffff"
        stroke-opacity="0.4"
        stroke-width="1.5"
        stroke-linecap="round"
      />

      <!-- Decorative page lines right -->
      <path
        d="M27 19.5C29 18.5 32.5 18.2 36 19"
        stroke="#ffffff"
        stroke-opacity="0.4"
        stroke-width="1.5"
        stroke-linecap="round"
      />
      <path
        d="M27 24.5C29 23.5 32.5 23.2 36 24"
        stroke="#ffffff"
        stroke-opacity="0.4"
        stroke-width="1.5"
        stroke-linecap="round"
      />
      <path
        d="M27 29.5C29 28.5 32.5 28.2 36 29"
        stroke="#ffffff"
        stroke-opacity="0.4"
        stroke-width="1.5"
        stroke-linecap="round"
      />

      <!-- Book center spine line -->
      <line
        x1="24"
        y1="13.5"
        x2="24"
        y2="37"
        stroke="#0d141e"
        stroke-width="1.2"
        stroke-linecap="round"
      />

      <!-- Cute amber ribbon bookmark -->
      <path
        d="M22.5 13V24.5L24 23L25.5 24.5V13H22.5Z"
        fill="url(#logoRibbonGrad)"
        class="logo-ribbon"
      />

      <!-- Cute little sparkle star in top-right corner -->
      <path
        d="M37 6.5C37 8.5 38.5 9 39.5 9.5C38.5 10 37 10.5 37 12.5C37 10.5 35.5 10 34.5 9.5C35.5 9 37 8.5 37 6.5Z"
        fill="#fde047"
        class="logo-sparkle"
      />
      <circle cx="37" cy="9.5" r="0.75" fill="#ffffff" />

      <!-- Gradients -->
      <defs>
        <linearGradient id="logoLeftPageGrad" x1="8" y1="12" x2="24" y2="37" gradientUnits="userSpaceOnUse">
          <stop stop-color="#fbbf24" />
          <stop offset="1" stop-color="#d97706" />
        </linearGradient>
        <linearGradient id="logoRightPageGrad" x1="40" y1="12" x2="24" y2="37" gradientUnits="userSpaceOnUse">
          <stop stop-color="#f59e0b" />
          <stop offset="1" stop-color="#b45309" />
        </linearGradient>
        <linearGradient id="logoRibbonGrad" x1="24" y1="13" x2="24" y2="24.5" gradientUnits="userSpaceOnUse">
          <stop stop-color="#f43f5e" />
          <stop offset="1" stop-color="#be123c" />
        </linearGradient>
      </defs>
    </svg>

    <span v-if="showText" class="logo-text">
      Meus Livros
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
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.3));
}

.with-badge .logo-badge-bg {
  fill: #1a1e24;
  stroke: #332a20;
  stroke-width: 1.5;
}

.logo-text {
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.01em;
  font-size: var(--font-size-xl);
}
</style>
