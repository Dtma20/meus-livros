<template>
  <a :href="href || '#'" class="card">
    <div class="poster">
      <BookCover
        :alt="altText"
        :title="title"
        :cover-url="coverUrl"
        :ol-cover-id="olCoverId"
        :isbn13="isbn13"
      />
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
}

.card:hover {
  transform: translateY(-5px);
}

.card:focus-visible {
  outline: 2px solid var(--highlight, #40bcf4);
  border-radius: var(--radius-sm, 4px);
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

.info {
  margin-top: var(--space-2, 8px);
  text-align: center;
}
</style>
