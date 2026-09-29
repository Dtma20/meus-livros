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
}

.card:focus-visible {
  outline: 2px solid var(--highlight, #f59e0b);
  outline-offset: 4px;
  border-radius: var(--radius-sm, 4px);
}

.media {
  position: relative;
  width: 100%;
}

.poster {
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm, 4px);
  border: var(--poster-border-width) solid var(--input-bg, #2c3440);
  background-color: #1e2328;
  overflow: hidden;
  position: relative;
  box-sizing: border-box;
  transition: border-color 0.2s, transform 0.1s;
}

.card:active .poster {
  transform: scale(0.98);
}

.card:hover .poster,
.poster:hover {
  border-color: var(--poster-border, #fff);
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
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-tight);
  font-weight: 500;
  color: var(--poster-border);
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

@media (hover: hover) and (pointer: fine) {
  .media {
    overflow: hidden;
    border-radius: var(--radius-sm, 4px);
  }

  .caption {
    position: absolute;
    bottom: var(--poster-border-width);
    left: var(--poster-border-width);
    right: var(--poster-border-width);
    width: auto;
    min-height: 0;
    margin-top: 0;
    padding: var(--space-4) var(--space-2) var(--space-2);
    background: linear-gradient(to bottom, transparent, var(--bg-color));
    border-radius: 0 0 calc(var(--radius-sm, 4px) - var(--poster-border-width)) calc(var(--radius-sm, 4px) - var(--poster-border-width));
    justify-content: flex-end;
    pointer-events: none;
    opacity: 0;
    transform: translateY(var(--space-1));
    transition: opacity 0.2s ease, transform 0.2s ease;
  }

  .card:hover .caption,
  .card:focus-visible .caption {
    opacity: 1;
    transform: translateY(0);
  }

  .caption-title {
    font-weight: 600;
  }
}

.info {
  margin-top: auto;
  padding-top: var(--space-2);
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .poster,
  .caption {
    transition: none;
  }

  .card:active .poster,
  .caption,
  .card:hover .caption,
  .card:focus-visible .caption {
    transform: none;
  }
}
</style>
