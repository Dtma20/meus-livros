import { describe, expect, it } from 'vitest'
import { calculateReadingProgress } from '../../shared/utils/reading-progress'

describe('calculateReadingProgress unit tests', () => {
  it('returns 0 progress when no intervals exist', () => {
    const res = calculateReadingProgress([], 400, false)
    expect(res.pagesRead).toBe(0)
    expect(res.currentPage).toBe(0)
    expect(res.totalPages).toBe(400)
    expect(res.percentage).toBe(0)
    expect(res.isComplete).toBe(false)
  })

  it('returns null percentage when totalPages is null or 0', () => {
    const res = calculateReadingProgress([{ start_page: 1, end_page: 50 }], null, false)
    expect(res.pagesRead).toBe(50)
    expect(res.currentPage).toBe(50)
    expect(res.totalPages).toBeNull()
    expect(res.percentage).toBeNull()
    expect(res.isComplete).toBe(false)
  })

  it('calculates sequential non-overlapping blocks', () => {
    const intervals = [
      { start_page: 1, end_page: 50 },
      { start_page: 51, end_page: 100 },
    ]
    const res = calculateReadingProgress(intervals, 400, false)
    expect(res.pagesRead).toBe(100)
    expect(res.currentPage).toBe(100)
    expect(res.percentage).toBe(25)
    expect(res.isComplete).toBe(false)
  })

  it('merges overlapping blocks correctly (user prompt example: 1-50 and 45-72)', () => {
    const intervals = [
      { start_page: 1, end_page: 50 },
      { start_page: 45, end_page: 72 },
    ]
    const res = calculateReadingProgress(intervals, 400, false)
    // Merged: 1 to 72 = 72 pages
    expect(res.pagesRead).toBe(72)
    expect(res.currentPage).toBe(72)
    expect(res.percentage).toBe(18) // 72 / 400 = 18%
    expect(res.intervals).toEqual([{ start_page: 1, end_page: 72 }])
  })

  it('handles completely contained subset blocks without double counting', () => {
    const intervals = [
      { start_page: 1, end_page: 100 },
      { start_page: 20, end_page: 50 },
      { start_page: 40, end_page: 80 },
    ]
    const res = calculateReadingProgress(intervals, 200, false)
    expect(res.pagesRead).toBe(100)
    expect(res.currentPage).toBe(100)
    expect(res.percentage).toBe(50)
    expect(res.intervals).toEqual([{ start_page: 1, end_page: 100 }])
  })

  it('handles out-of-order blocks with gaps', () => {
    const intervals = [
      { start_page: 100, end_page: 120 }, // 21 pages
      { start_page: 1, end_page: 50 },     // 50 pages
    ]
    const res = calculateReadingProgress(intervals, 400, false)
    expect(res.pagesRead).toBe(71)
    expect(res.currentPage).toBe(120)
    expect(res.percentage).toBe(18) // 71 / 400 = 17.75% -> 18%
    expect(res.intervals).toEqual([
      { start_page: 1, end_page: 50 },
      { start_page: 100, end_page: 120 },
    ])
  })

  it('returns 100% when isFinished is true', () => {
    const intervals = [{ start_page: 1, end_page: 50 }]
    const res = calculateReadingProgress(intervals, 400, true)
    expect(res.percentage).toBe(100)
    expect(res.pagesRead).toBe(400)
    expect(res.isComplete).toBe(true)
  })

  it('filters invalid intervals (non-positive or end < start)', () => {
    const intervals = [
      { start_page: -5, end_page: 10 },
      { start_page: 50, end_page: 20 },
      { start_page: 1, end_page: 30 },
    ]
    const res = calculateReadingProgress(intervals, 100, false)
    expect(res.pagesRead).toBe(30)
    expect(res.currentPage).toBe(30)
    expect(res.percentage).toBe(30)
  })
})
