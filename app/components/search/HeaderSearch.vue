<template>
  <div v-if="!isHidden" class="header-search">
    <div class="header-search-desktop">
      <SearchBox @select="onSelectWork" />
    </div>

    <button
      ref="searchButtonRef"
      type="button"
      class="header-search-trigger"
      aria-label="Buscar livros"
      :aria-expanded="isMobileOpen"
      @click="toggleMobile"
    >
      <svg
        class="search-icon"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    </button>

    <div
      v-if="isMobileOpen"
      ref="mobileRowRef"
      class="header-search-mobile-row"
      @keydown="onMobileKeydown"
    >
      <div class="mobile-search-input-wrap">
        <SearchBox @select="onSelectWork" />
      </div>
      <button
        type="button"
        class="mobile-close-btn"
        aria-label="Fechar busca"
        @click="closeMobile"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import SearchBox from './SearchBox.vue'

type AppRoute = ReturnType<typeof useRoute>

function getSafeRoute(): AppRoute | null {
  try {
    return useRoute()
  } catch {
    return null
  }
}

const route = getSafeRoute()

const isHidden = computed(() => {
  const p = route?.path || ''
  return p === '/entrar' || p.startsWith('/entrar/')
})

const isMobileOpen = ref(false)
const searchButtonRef = ref<HTMLButtonElement | null>(null)
const mobileRowRef = ref<HTMLDivElement | null>(null)

async function openMobile(): Promise<void> {
  isMobileOpen.value = true
  await nextTick()
  const input = mobileRowRef.value?.querySelector<HTMLInputElement>('input')
  input?.focus()
}

function closeMobile(): void {
  if (!isMobileOpen.value) return
  isMobileOpen.value = false
  nextTick(() => {
    searchButtonRef.value?.focus()
  })
}

function toggleMobile(): void {
  if (isMobileOpen.value) {
    closeMobile()
  } else {
    void openMobile()
  }
}

function onSelectWork(): void {
  if (isMobileOpen.value) {
    isMobileOpen.value = false
  }
}

function onMobileKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    closeMobile()
  }
}

function onWindowKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && isMobileOpen.value) {
    closeMobile()
  }
}

watch(
  () => route?.path,
  () => {
    if (isMobileOpen.value) {
      isMobileOpen.value = false
    }
  },
)

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onWindowKeydown)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', onWindowKeydown)
  }
})
</script>

<style scoped>
.header-search {
  display: flex;
  align-items: center;
}

@media (min-width: 768px) {
  .header-search {
    flex: 1;
    max-width: 360px;
    margin: 0 var(--space-4);
  }

  .header-search-desktop {
    display: block;
    width: 100%;
  }

  .header-search-trigger {
    display: none;
  }

  .header-search-mobile-row {
    display: none;
  }
}

@media (max-width: 767px) {
  .header-search {
    flex: 0 0 auto;
    margin-left: auto;
  }

  .header-search-desktop {
    display: none;
  }

  .header-search-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
}

.header-search-trigger {
  min-width: var(--target-min-size);
  min-height: var(--target-min-size);
  background: transparent;
  border: none;
  color: var(--text-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  padding: var(--space-2);
  transition: background-color 0.25s ease 0.05s, color 0.25s ease 0.05s;
}

.header-search-trigger:hover {
  background-color: var(--card-bg);
  color: var(--highlight);
}

.header-search-trigger:focus-visible {
  outline: 2px solid var(--highlight);
  outline-offset: 2px;
}

.search-icon {
  display: block;
}

.header-search-mobile-row {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  width: 100%;
  box-sizing: border-box;
  background-color: var(--bg-color);
  border-bottom: 1px solid var(--input-bg);
  padding: var(--space-2) var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  z-index: 150;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.mobile-search-input-wrap {
  flex: 1;
  min-width: 0;
}

.mobile-search-input-wrap :deep(.search-box) {
  max-width: none;
}

.mobile-close-btn {
  flex-shrink: 0;
  min-width: var(--target-min-size);
  min-height: var(--target-min-size);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  padding: var(--space-2);
  transition: background-color 0.25s ease 0.05s, color 0.25s ease 0.05s;
}

.mobile-close-btn:hover {
  background-color: var(--card-bg);
  color: var(--highlight);
}

.mobile-close-btn:focus-visible {
  outline: 2px solid var(--highlight);
  outline-offset: 2px;
}
</style>
