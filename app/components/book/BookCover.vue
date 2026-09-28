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

const TITLE_LINE_CHARS = 14
const TITLE_MAX_LINES = 3
const AUTHOR_MAX_CHARS = 22
const SANS_STACK = 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif'
const SERIF_STACK = 'Lora, Georgia, serif'

function truncate(text: string, max: number): string {
  const chars = Array.from(text)
  if (chars.length <= max) return text
  return `${chars.slice(0, max - 1).join('').trimEnd()}…`
}

function wrapTitle(title?: string | null): string[] {
  if (!title || typeof title !== 'string') return []
  const words = title.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (!current || Array.from(candidate).length <= TITLE_LINE_CHARS) {
      current = candidate
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)

  if (lines.length <= TITLE_MAX_LINES) {
    return lines.map(line => truncate(line, TITLE_LINE_CHARS))
  }
  const kept = lines.slice(0, TITLE_MAX_LINES).map(line => truncate(line, TITLE_LINE_CHARS))
  const last = kept[TITLE_MAX_LINES - 1] ?? ''
  kept[TITLE_MAX_LINES - 1] = last.endsWith('…')
    ? last
    : truncate(`${last}…`, TITLE_LINE_CHARS)
  return kept
}

function authorFromAlt(alt: string, title?: string | null): string {
  if (!title) return ''
  const prefix = `Capa de ${title}, de `
  return alt.startsWith(prefix) ? alt.slice(prefix.length).trim() : ''
}

function generatePlaceholderSvg(title?: string | null, author?: string): string {
  const background = `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#232a31"/><stop offset="1" stop-color="#2c3440"/></linearGradient></defs>
  <rect width="200" height="300" fill="url(#bg)"/>
  <rect width="4" height="300" fill="#f59e0b"/>`

  const lines = wrapTitle(title)
  let content: string
  if (lines.length === 0) {
    const initials = escapeXml(getInitials(title))
    content = `<text x="102" y="150" dominant-baseline="central" text-anchor="middle" fill="#99aabb" font-family="${SANS_STACK}" font-size="54" font-weight="bold">${initials}</text>`
  } else {
    const titleY = 56
    const lineHeight = 26
    const tspans = lines
      .map((line, i) => `<tspan x="20" y="${titleY + i * lineHeight}">${escapeXml(line)}</tspan>`)
      .join('')
    content = `<text fill="#fff" fill-opacity="0.85" font-family="${SERIF_STACK}" font-size="20" font-weight="600">${tspans}</text>`
    const cleanAuthor = author?.trim()
    if (cleanAuthor) {
      const authorY = titleY + (lines.length - 1) * lineHeight + 28
      content += `<text x="20" y="${authorY}" fill="#99aabb" font-family="${SANS_STACK}" font-size="13">${escapeXml(truncate(cleanAuthor, AUTHOR_MAX_CHARS))}</text>`
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300" width="200" height="300">
  ${background}
  ${content}
</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const placeholderSrc = computed(() =>
  generatePlaceholderSvg(props.title, authorFromAlt(props.alt, props.title))
)

const currentSrc = computed(() => {
  if (failed.value) {
    return placeholderSrc.value
  }

  if (props.coverUrl) {
    if (isHttpsCoverUrl(props.coverUrl)) {
      return props.coverUrl.trim()
    }
    return placeholderSrc.value
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

  return placeholderSrc.value
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
  color: var(--text-color);
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
