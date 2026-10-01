<template>
  <a :href="href || '#'" class="card" :aria-label="cardAriaLabel">
    <div class="media">
      <div class="poster">
        <BookCover
          :alt="altText"
          :title="title"
          :cover-url="coverUrl"
          :ol-cover-id="olCoverId"
          :isbn13="isbn13"
          :loading="loading"
        />
      </div>
      <div class="caption" aria-hidden="true">
        <span class="caption-title">{{ title }}</span>
        <span v-if="author" class="caption-author">{{ author }}</span>
      </div>
    </div>
    <div v-if="rating" class="info">
      <StarRating :rating="rating" />
    </div>
  </a>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BookCover from './BookCover.vue'
import StarRating from './StarRating.vue'

const props = defineProps<{
  title: string
  author?: string | null
  rating?: number | null
  coverUrl?: string | null
  olCoverId?: number | string | null
  isbn13?: string | null
  href?: string | null
  loading?: 'lazy' | 'eager'
}>()

const altText = computed(() => {
  const title = props.title
  const author = props.author
  if (title && author) {
    return `Capa de ${title}, de ${author}`
  }
  if (title) {
    return `Capa de ${title}`
  }
  return 'Capa do livro'
})

const cardAriaLabel = computed(() => {
  const title = props.title
  const author = props.author
  if (title && author) {
    if (props.rating) {
      const formatted = String(props.rating).replace('.', ',')
      return `${title}, de ${author} (${formatted} de 5 estrelas)`
    }
    return `${title}, de ${author}`
  }
  if (title) {
    if (props.rating) {
      const formatted = String(props.rating).replace('.', ',')
      return `${title} (${formatted} de 5 estrelas)`
    }
    return title
  }
  return 'Livro'
})
</script>

<style scoped>
@keyframes bookCardEnter {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.card {
  --poster-border-width: 1px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  outline-offset: 4px;
  width: 100%;
  height: 100%;
  animation: bookCardEnter 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.card:nth-child(1) { animation-delay: 0.03s; }
.card:nth-child(2) { animation-delay: 0.06s; }
.card:nth-child(3) { animation-delay: 0.09s; }
.card:nth-child(4) { animation-delay: 0.12s; }
.card:nth-child(5) { animation-delay: 0.15s; }
.card:nth-child(6) { animation-delay: 0.18s; }
.card:nth-child(7) { animation-delay: 0.21s; }
.card:nth-child(8) { animation-delay: 0.24s; }
.card:nth-child(9) { animation-delay: 0.27s; }
.card:nth-child(10) { animation-delay: 0.30s; }
.card:nth-child(11) { animation-delay: 0.33s; }
.card:nth-child(12) { animation-delay: 0.36s; }

.card:focus-visible {
  outline: 2px solid var(--highlight, #f59e0b);
  outline-offset: 4px;
  border-radius: var(--radius-sm, 6px);
}

.media {
  position: relative;
  width: 100%;
}

.poster {
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm, 6px);
  border: var(--poster-border-width) solid var(--input-bg, #2c3440);
  background-color: #1e2328;
  overflow: hidden;
  position: relative;
  box-sizing: border-box;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.2s ease, border-color 0.2s ease;
}

.card:active .poster {
  transform: scale(0.97) translateY(0);
  transition-duration: 0.08s;
}

.card:hover .poster,
.poster:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.5), 0 3px 8px rgba(0, 0, 0, 0.3);
  border-color: rgba(255, 255, 255, 0.35);
}

.caption {
  display: flex;
  flex-direction: column;
  margin-top: var(--space-2);
  min-height: calc(var(--font-size-xs) * var(--line-height-tight) * 3 + var(--space-1));
  width: 100%;
  text-align: center;
  box-sizing: border-box;
}

.caption-title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-serif);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-tight);
  font-weight: 600;
  color: var(--text-bright);
}

.caption-author {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-tight);
  color: var(--text-color);
  margin-top: var(--space-1);
}

.info {
  margin-top: auto;
  padding-top: var(--space-2);
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .card {
    animation: none;
  }

  .poster {
    transition: none;
  }

  .card:hover .poster,
  .poster:hover,
  .card:active .poster {
    transform: none;
  }
}
</style>
