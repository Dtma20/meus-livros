import { describe, expect, it } from 'vitest'
import { evaluateSearchBenchmark } from '../../scripts/search-benchmark-metrics'

describe('Search benchmark budget', () => {
  it('reports the raw p95, baseline and their difference for a search within budget', () => {
    expect(evaluateSearchBenchmark([3, 1, 2], [25, 10, 15])).toEqual({
      baselineP95: 3, searchP95: 25, overhead: 22, median: 15, min: 10, max: 25,
    })
  })
  it.each([150, 151])('fails the strict <150ms budget when overhead is %i ms', (overhead) => {
    expect(() => evaluateSearchBenchmark([10], [10 + overhead])).toThrow(/150ms/)
  })
  it('rejects missing or invalid measurements instead of passing a NaN budget', () => {
    expect(() => evaluateSearchBenchmark([], [10])).toThrow(/Amostras/)
    expect(() => evaluateSearchBenchmark([1], [Number.NaN])).toThrow(/Amostras/)
  })
})
