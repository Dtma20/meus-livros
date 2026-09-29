<template>
  <div
    v-if="hasRatings"
    class="rating-histogram"
    role="img"
    :aria-label="accessibleSummary"
  >
    <div class="histogram-bars">
      <div
        v-for="bar in bars"
        :key="bar.value"
        class="histogram-bar-track"
        :data-rating="bar.value"
      >
        <div
          class="histogram-bar bar"
          :data-rating="bar.value"
          :data-count="bar.count"
          :style="{ height: `${bar.heightPercent}%` }"
        />
      </div>
    </div>
    <div class="histogram-labels" aria-hidden="true">
      <span class="histogram-star-label histogram-star-start">★</span>
      <span class="histogram-star-label histogram-star-end">★</span>
    </div>
    <span class="sr-only">{{ accessibleSummary }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    ratings?: number[]
  }>(),
  {
    ratings: () => [],
  },
)

const BUCKETS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5] as const

const bucketCounts = computed(() => {
  const counts: Record<number, number> = {
    0.5: 0,
    1: 0,
    1.5: 0,
    2: 0,
    2.5: 0,
    3: 0,
    3.5: 0,
    4: 0,
    4.5: 0,
    5: 0,
  }

  if (!props.ratings) return counts

  for (const r of props.ratings) {
    const num = Number(r)
    if (!Number.isNaN(num) && num in counts) {
      counts[num] = (counts[num] ?? 0) + 1
    }
  }

  return counts
})

const maxCount = computed(() => {
  return Math.max(...Object.values(bucketCounts.value), 0)
})

const hasRatings = computed(() => {
  return Boolean(props.ratings && props.ratings.length > 0 && maxCount.value > 0)
})

const bars = computed(() => {
  const max = maxCount.value
  return BUCKETS.map((val) => {
    const count = bucketCounts.value[val] ?? 0
    const heightPercent = max > 0 ? (count / max) * 100 : 0
    return {
      value: val,
      count,
      heightPercent,
    }
  })
})

function formatRatingValue(val: number): string {
  const str = String(val).replace('.', ',')
  return `${str} ${val === 1 ? 'estrela' : 'estrelas'}`
}

const accessibleSummary = computed(() => {
  if (!props.ratings || props.ratings.length === 0) return ''

  const counts = bucketCounts.value
  const activeBuckets = [...BUCKETS]
    .filter((v) => (counts[v] ?? 0) > 0)
    .reverse()

  if (activeBuckets.length === 0) {
    return 'Distribuição das notas: nenhuma avaliação'
  }

  const parts = activeBuckets.map((val) => {
    const c = counts[val]
    return `${c} de ${formatRatingValue(val)}`
  })

  return `Distribuição das notas: ${parts.join(', ')}`
})
</script>

<style scoped>
.rating-histogram {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: 120px;
}

.histogram-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 36px;
}

.histogram-bar-track {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: flex-end;
}

.histogram-bar {
  width: 100%;
  min-height: 2px;
  background-color: var(--star-color);
  border-radius: 1px;
  transition: height 0.2s ease;
}

.histogram-bar[data-count="0"] {
  background-color: var(--input-bg);
}

.histogram-labels {
  display: flex;
  justify-content: space-between;
  line-height: 1;
}

.histogram-star-label {
  color: var(--star-color);
  font-size: var(--font-size-xs);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
</style>
