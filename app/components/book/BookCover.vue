<template>
  <span
    class="book-cover"
    :class="{ 'is-loading': hidden, 'is-loaded': loaded }"
  >
    <img
      ref="imgRef"
      :src="currentSrc"
      :alt="alt"
      :loading="loading ?? 'lazy'"
      :fetchpriority="loading === 'eager' ? 'high' : undefined"
      class="book-cover-img"
      @load="onLoad"
      @error="onError"
    >
  </span>
</template>

<script setup lang="ts">
import { isHttpsCoverUrl } from '~~/shared/schemas/work'
import { computed, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  alt: string
  title?: string
  coverUrl?: string | null
  olCoverId?: number | string | null
  isbn13?: string | null
  isbn?: string | null
  loading?: 'lazy' | 'eager'
}>()

const failed = ref(false)
const loaded = ref(false)
const hidden = ref(false)
const imgRef = ref<HTMLImageElement | null>(null)

watch(
  () => [
    props.coverUrl,
    props.olCoverId,
    props.isbn13,
    props.isbn,
    props.title
  ],
  () => {
    failed.value = false
  }
)

function getInitials(title?: string | null): string {
  if (!title || typeof title !== 'string') return '?'
  const cleanTitle = title.trim()
  if (!cleanTitle) return '?'
  const words = cleanTitle.split(/\s+/).filter(Boolean)
  const firstWord = words[0]
  if (!firstWord) return '?'
  if (words.length === 1) {
    return firstWord.slice(0, 2).toUpperCase()
  }
  const secondWord = words[1]
  const firstChar = firstWord[0] ?? ''
  const secondChar = secondWord?.[0] ?? ''
  return (firstChar + secondChar).toUpperCase() || '?'
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '&': return '&amp;'
      case '\'': return '&apos;'
      case '"': return '&quot;'
      default: return c
    }
  })
}

function generatePlaceholderSvg(title?: string | null): string {
  const initials = escapeXml(getInitials(title))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300" width="200" height="300">
  <rect width="100%" height="100%" fill="#2c3440"/>
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="#99aabb" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="54" font-weight="bold">${initials}</text>
</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const currentSrc = computed(() => {
  if (failed.value) {
    return generatePlaceholderSvg(props.title)
  }

  if (props.coverUrl) {
    if (isHttpsCoverUrl(props.coverUrl)) {
      return props.coverUrl.trim()
    }
    return generatePlaceholderSvg(props.title)
  }

  if (props.olCoverId != null && String(props.olCoverId).trim() !== '') {
    return `https://covers.openlibrary.org/b/id/${encodeURIComponent(String(props.olCoverId).trim())}-M.jpg`
  }

  const rawIsbn = props.isbn13 ?? props.isbn
  if (rawIsbn) {
    const clean = String(rawIsbn).replace(/[-\s]/g, '').trim()
    if (clean) {
      return `https://covers.openlibrary.org/b/isbn/${clean}-L.jpg?default=false`
    }
  }

  return generatePlaceholderSvg(props.title)
})

function syncWithImage() {
  const img = imgRef.value
  if (!img) return
  if (img.complete) {
    hidden.value = false
    loaded.value = true
    return
  }
  loaded.value = false
  hidden.value = !currentSrc.value.startsWith('data:')
}

watch(currentSrc, syncWithImage, { flush: 'post' })

onMounted(syncWithImage)

function onLoad() {
  hidden.value = false
  loaded.value = true
}

function onError() {
  hidden.value = false
  failed.value = true
}
</script>

<style scoped>
.book-cover {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  aspect-ratio: 2 / 3;
  overflow: hidden;
  background-color: var(--card-bg);
  background-image: linear-gradient(
    100deg,
    transparent 20%,
    var(--input-bg) 50%,
    transparent 80%
  );
  background-size: 200% 100%;
  background-repeat: no-repeat;
  animation: book-cover-shimmer 1.8s ease-in-out infinite;
}

.book-cover.is-loaded {
  background-image: none;
  animation: none;
}

.book-cover-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  opacity: 1;
  transition: opacity 0.2s ease;
}

.book-cover.is-loading .book-cover-img {
  opacity: 0;
  transition: none;
}

@keyframes book-cover-shimmer {
  from {
    background-position: 150% 0;
  }
  to {
    background-position: -50% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .book-cover {
    background-image: none;
    animation: none;
  }

  .book-cover-img {
    transition: none;
  }
}
</style>
