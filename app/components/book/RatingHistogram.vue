<template>
  <div
    v-if="hasRatings && size === 'small'"
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
  <ol
    v-else-if="hasRatings && size === 'large'"
    class="rating-histogram-large"
    aria-label="Distribuição das notas"
  >
    <li
      v-for="bar in largeRows"
      :key="bar.value"
      class="histogram-row"
      :data-rating="bar.value"
      :data-count="bar.count"
    >
      <span class="histogram-row-label">
        {{ formatRatingNumber(bar.value) }}<span aria-hidden="true">{{ '\u00a0★' }}</span><span class="sr-only">{{ bar.value === 1 ? ' estrela:' : ' estrelas:' }}</span>
      </span>
      <span class="histogram-row-track" aria-hidden="true">
        <span class="histogram-row-fill" :style="{ width: `${bar.heightPercent}%` }" />
      </span>
      <span class="histogram-row-count">
        {{ bar.count }}<span class="sr-only">{{ bar.count === 1 ? ' avaliação' : ' avaliações' }}</span>
      </span>
    </li>
  </ol>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    ratings?: number[]
    /**
     * `small` is the 120x36 book-page sparkline. `large` is the stats-page
     * version: one labelled row per half-star value with its count.
     */
    size?: 'small' | 'large'
  }>(),
  {
    ratings: () => [],
    size: 'small',
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

const largeRows = computed(() => [...bars.value].reverse())

function formatRatingNumber(val: number): string {
  return String(val).replace('.', ',')
}

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

@keyframes growHistogramUp {
  from {
    transform: scaleY(0);
  }
  to {
    transform: scaleY(1);
  }
}

.histogram-bar {
  width: 100%;
  min-height: 2px;
  background-color: var(--star-color);
  border-radius: 1px;
  transform-origin: bottom;
  animation: growHistogramUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.histogram-bar-track:nth-child(1) .histogram-bar { animation-delay: 0.02s; }
.histogram-bar-track:nth-child(2) .histogram-bar { animation-delay: 0.04s; }
.histogram-bar-track:nth-child(3) .histogram-bar { animation-delay: 0.06s; }
.histogram-bar-track:nth-child(4) .histogram-bar { animation-delay: 0.08s; }
.histogram-bar-track:nth-child(5) .histogram-bar { animation-delay: 0.10s; }
.histogram-bar-track:nth-child(6) .histogram-bar { animation-delay: 0.12s; }
.histogram-bar-track:nth-child(7) .histogram-bar { animation-delay: 0.14s; }
.histogram-bar-track:nth-child(8) .histogram-bar { animation-delay: 0.16s; }
.histogram-bar-track:nth-child(9) .histogram-bar { animation-delay: 0.18s; }
.histogram-bar-track:nth-child(10) .histogram-bar { animation-delay: 0.20s; }

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

@keyframes growHistogramRight {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}

@keyframes histogramRowEnter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.rating-histogram-large {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
  max-width: 32rem;
}

.histogram-row {
  display: grid;
  grid-template-columns: 3.5rem 1fr 2.5rem;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-tight);
  animation: histogramRowEnter 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.histogram-row:nth-child(1) .histogram-row-fill,
.histogram-row:nth-child(1) { animation-delay: 0.03s; }
.histogram-row:nth-child(2) .histogram-row-fill,
.histogram-row:nth-child(2) { animation-delay: 0.06s; }
.histogram-row:nth-child(3) .histogram-row-fill,
.histogram-row:nth-child(3) { animation-delay: 0.09s; }
.histogram-row:nth-child(4) .histogram-row-fill,
.histogram-row:nth-child(4) { animation-delay: 0.12s; }
.histogram-row:nth-child(5) .histogram-row-fill,
.histogram-row:nth-child(5) { animation-delay: 0.15s; }
.histogram-row:nth-child(6) .histogram-row-fill,
.histogram-row:nth-child(6) { animation-delay: 0.18s; }
.histogram-row:nth-child(7) .histogram-row-fill,
.histogram-row:nth-child(7) { animation-delay: 0.21s; }
.histogram-row:nth-child(8) .histogram-row-fill,
.histogram-row:nth-child(8) { animation-delay: 0.24s; }
.histogram-row:nth-child(9) .histogram-row-fill,
.histogram-row:nth-child(9) { animation-delay: 0.27s; }
.histogram-row:nth-child(10) .histogram-row-fill,
.histogram-row:nth-child(10) { animation-delay: 0.30s; }

.histogram-row-label {
  color: var(--text-bright);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.histogram-row-label [aria-hidden="true"] {
  color: var(--star-color);
}

.histogram-row-track {
  display: block;
  height: var(--space-2);
  background-color: var(--input-bg);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.histogram-row-fill {
  display: block;
  height: 100%;
  background-color: var(--star-color);
  border-radius: var(--radius-sm);
  transform-origin: left;
  animation: growHistogramRight 0.55s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.histogram-row-count {
  color: var(--text-color);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.histogram-row[data-count="0"] .histogram-row-label,
.histogram-row[data-count="0"] .histogram-row-count {
  opacity: 0.6;
}

@media (prefers-reduced-motion: reduce) {
  .histogram-bar,
  .histogram-row,
  .histogram-row-fill {
    animation: none;
    transition: none;
  }
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
