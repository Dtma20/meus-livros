export interface PageInterval {
  start_page: number
  end_page: number
}

export interface ReadingProgressResult {
  pagesRead: number
  currentPage: number
  totalPages: number | null
  percentage: number | null
  isComplete: boolean
  intervals: PageInterval[]
}

/**
 * Calculates reading progress from recorded reading blocks without double-counting
 * overlapping pages or out-of-order sessions.
 */
export function calculateReadingProgress(
  intervals: PageInterval[],
  totalPages: number | null = null,
  isFinished: boolean = false,
): ReadingProgressResult {
  const safeTotalPages = totalPages && totalPages > 0 ? totalPages : null

  if (isFinished) {
    const highestPage = intervals.reduce((max, cur) => Math.max(max, cur.end_page), safeTotalPages ?? 0)
    return {
      pagesRead: safeTotalPages ?? highestPage,
      currentPage: safeTotalPages ?? highestPage,
      totalPages: safeTotalPages,
      percentage: 100,
      isComplete: true,
      intervals: [],
    }
  }

  // Filter valid intervals
  const valid = intervals.filter((i) => i.start_page > 0 && i.end_page >= i.start_page)

  if (valid.length === 0) {
    return {
      pagesRead: 0,
      currentPage: 0,
      totalPages: safeTotalPages,
      percentage: safeTotalPages ? 0 : null,
      isComplete: false,
      intervals: [],
    }
  }

  // Sort intervals by start_page ascending, then end_page ascending
  const sorted = [...valid].sort((a, b) => {
    if (a.start_page !== b.start_page) return a.start_page - b.start_page
    return a.end_page - b.end_page
  })

  // Merge overlapping and contiguous intervals
  const merged: PageInterval[] = []
  for (const interval of sorted) {
    const last = merged[merged.length - 1]
    if (!last) {
      merged.push({ start_page: interval.start_page, end_page: interval.end_page })
      continue
    }

    if (interval.start_page <= last.end_page + 1) {
      // Overlap or contiguous: extend the end of previous interval if necessary
      last.end_page = Math.max(last.end_page, interval.end_page)
    } else {
      // Non-contiguous: push new interval
      merged.push({ start_page: interval.start_page, end_page: interval.end_page })
    }
  }

  // Calculate unique pages read
  const pagesRead = merged.reduce((acc, cur) => acc + (cur.end_page - cur.start_page + 1), 0)
  const currentPage = valid.reduce((max, cur) => Math.max(max, cur.end_page), 0)

  // isComplete deriva do valor bruto: o arredondamento do percentual
  // atravessaria o limiar (399/400 = 99,75% arredonda para 100).
  const isComplete = safeTotalPages ? pagesRead >= safeTotalPages : false

  let percentage: number | null = null
  if (safeTotalPages) {
    // floor: 100% só aparece quando o livro realmente acabou.
    percentage = Math.min(100, Math.floor((pagesRead / safeTotalPages) * 100))
  }

  return {
    pagesRead,
    currentPage,
    totalPages: safeTotalPages,
    percentage,
    isComplete,
    intervals: merged,
  }
}
