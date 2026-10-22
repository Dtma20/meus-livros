// Difference of p95 estimates the additional query cost; it is not a per-sample net p95.
export function evaluateSearchBenchmark(baseline: number[], searched: number[]) {
  if ([baseline, searched].some((samples) => samples.length === 0 || samples.some((n) => !Number.isFinite(n) || n < 0))) {
    throw new Error('Amostras de benchmark devem ser finitas, não negativas e não vazias.')
  }
  const ordered = [...searched].sort((a, b) => a - b)
  const percentile = (samples: number[], fraction: number) => {
    const sorted = [...samples].sort((a, b) => a - b)
    return sorted[Math.ceil(sorted.length * fraction) - 1]!
  }
  const baselineP95 = percentile(baseline, 0.95)
  const searchP95 = percentile(searched, 0.95)
  const overhead = searchP95 - baselineP95
  if (overhead >= 150) {
    throw new Error(`Busca excedeu a meta estrita de 150ms: diferença de p95 ${overhead.toFixed(2)}ms (busca ${searchP95.toFixed(2)}ms, baseline ${baselineP95.toFixed(2)}ms).`)
  }
  return { baselineP95, searchP95, overhead, median: percentile(searched, 0.5), min: ordered[0]!, max: ordered[ordered.length - 1]! }
}
