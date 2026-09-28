<template>
  <a :href="href || '#'" class="card" :aria-label="cardAriaLabel">
    <div class="poster">
      <BookCover
        :alt="altText"
        :title="title"
        :cover-url="coverUrl"
        :ol-cover-id="olCoverId"
        :isbn13="isbn13"
        :loading="loading"
      />
      <div class="overlay" aria-hidden="true">
        <span class="title overlay-title">{{ title }}</span>
        <span v-if="author" class="author overlay-author">{{ author }}</span>
      </div>
    </div>
    <div class="caption" aria-hidden="true">
      <span class="title caption-title">{{ title }}</span>
      <span v-if="author" class="author caption-author">{{ author }}</span>
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
  display: flex;
  flex-direction: column;
  align-items: center;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  transition: transform 0.2s;
  outline-offset: 4px;
  width: 100%;
}

.card:hover {
  transform: translateY(-5px);
}

.card:focus-visible {
  outline: 2px solid var(--highlight, #f59e0b);
  outline-offset: 4px;
  border-radius: var(--radius-sm, 4px);
}

@media (prefers-reduced-motion: reduce) {
  .card {
    transition: none;
  }
  .card:hover {
    transform: none;
  }
  .overlay {
    transition: none;
    transform: none;
  }
}

.poster {
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm, 4px);
  border: 1px solid var(--input-bg, #2c3440);
  background-color: #1e2328;
  overflow: hidden;
  position: relative;
  transition: border-color 0.2s;
}

.card:hover .poster,
.poster:hover {
  border-color: var(--poster-border, #fff);
}

.overlay {
  display: none;
}

.caption {
  display: flex;
  flex-direction: column;
  margin-top: var(--space-2);
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

@media (hover: none) {
  .overlay {
    display: none;
  }

  .caption {
    display: flex;
  }
}

@media (hover: hover) and (pointer: fine) {
  .caption {
    display: none;
  }

  .overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: var(--space-4) var(--space-2) var(--space-2);
    background: linear-gradient(to bottom, transparent, var(--bg-color));
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    text-align: center;
    box-sizing: border-box;
    pointer-events: none;
    opacity: 0;
    transform: translateY(var(--space-1));
    transition: opacity 0.2s ease, transform 0.2s ease;
  }

  .card:hover .overlay,
  .card:focus-visible .overlay {
    opacity: 1;
    transform: translateY(0);
  }

  .overlay-title {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--font-sans);
    font-size: var(--font-size-xs);
    line-height: var(--line-height-tight);
    font-weight: 600;
    color: var(--poster-border);
  }

  .overlay-author {
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
}

.info {
  margin-top: var(--space-2);
  text-align: center;
}
</style>
