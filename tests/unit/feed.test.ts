import { describe, expect, it } from 'vitest'
import { formatRelativeDate } from '../../app/utils/date'
import { buildReviewExcerpt, feedQuerySchema } from '../../shared/schemas/feed'

describe('Feed Unit Tests', () => {
  describe('formatRelativeDate', () => {
    const fixedNow = new Date('2026-09-20T12:00:00.000Z')

    it('returns empty string for null, undefined or invalid date', () => {
      expect(formatRelativeDate(null, fixedNow)).toBe('')
      expect(formatRelativeDate(undefined, fixedNow)).toBe('')
      expect(formatRelativeDate('invalid-date', fixedNow)).toBe('')
    })

    it('formats seconds as "há poucos instantes"', () => {
      const past = new Date('2026-09-20T11:59:45.000Z')
      expect(formatRelativeDate(past, fixedNow)).toBe('há poucos instantes')
    })

    it('formats minutes', () => {
      const oneMinAgo = new Date('2026-09-20T11:59:00.000Z')
      expect(formatRelativeDate(oneMinAgo, fixedNow)).toBe('há 1 minuto')

      const fiveMinAgo = new Date('2026-09-20T11:55:00.000Z')
      expect(formatRelativeDate(fiveMinAgo, fixedNow)).toBe('há 5 minutos')
    })

    it('formats hours', () => {
      const oneHourAgo = new Date('2026-09-20T11:00:00.000Z')
      expect(formatRelativeDate(oneHourAgo, fixedNow)).toBe('há 1 hora')

      const threeHoursAgo = new Date('2026-09-20T09:00:00.000Z')
      expect(formatRelativeDate(threeHoursAgo, fixedNow)).toBe('há 3 horas')
    })

    it('formats days (e.g. "há 2 dias")', () => {
      const oneDayAgo = new Date('2026-09-19T12:00:00.000Z')
      expect(formatRelativeDate(oneDayAgo, fixedNow)).toBe('há 1 dia')

      const twoDaysAgo = new Date('2026-09-18T12:00:00.000Z')
      expect(formatRelativeDate(twoDaysAgo, fixedNow)).toBe('há 2 dias')

      const sixDaysAgo = new Date('2026-09-14T12:00:00.000Z')
      expect(formatRelativeDate(sixDaysAgo, fixedNow)).toBe('há 6 dias')
    })

    it('formats weeks', () => {
      const oneWeekAgo = new Date('2026-09-13T12:00:00.000Z')
      expect(formatRelativeDate(oneWeekAgo, fixedNow)).toBe('há 1 semana')

      const threeWeeksAgo = new Date('2026-08-30T12:00:00.000Z')
      expect(formatRelativeDate(threeWeeksAgo, fixedNow)).toBe('há 3 semanas')
    })

    it('formats months', () => {
      const oneMonthAgo = new Date('2026-08-15T12:00:00.000Z')
      expect(formatRelativeDate(oneMonthAgo, fixedNow)).toBe('há 1 mês')

      const threeMonthsAgo = new Date('2026-06-15T12:00:00.000Z')
      expect(formatRelativeDate(threeMonthsAgo, fixedNow)).toBe('há 3 meses')
    })

    it('formats years', () => {
      const oneYearAgo = new Date('2025-09-15T12:00:00.000Z')
      expect(formatRelativeDate(oneYearAgo, fixedNow)).toBe('há 1 ano')

      const twoYearsAgo = new Date('2024-09-15T12:00:00.000Z')
      expect(formatRelativeDate(twoYearsAgo, fixedNow)).toBe('há 2 anos')
    })

    it('formats boundary between months and years (360, 364, 365 days)', () => {
      const daysAgo360 = new Date(fixedNow.getTime() - 360 * 24 * 60 * 60 * 1000)
      const daysAgo364 = new Date(fixedNow.getTime() - 364 * 24 * 60 * 60 * 1000)
      const daysAgo365 = new Date(fixedNow.getTime() - 365 * 24 * 60 * 60 * 1000)

      expect(formatRelativeDate(daysAgo360, fixedNow)).toBe('há 12 meses')
      expect(formatRelativeDate(daysAgo364, fixedNow)).toBe('há 12 meses')
      expect(formatRelativeDate(daysAgo365, fixedNow)).toBe('há 1 ano')
    })
  })

  describe('buildReviewExcerpt', () => {
    it('returns null for null, undefined or empty review', () => {
      expect(buildReviewExcerpt(null)).toBeNull()
      expect(buildReviewExcerpt(undefined)).toBeNull()
      expect(buildReviewExcerpt('')).toBeNull()
      expect(buildReviewExcerpt('   ')).toBeNull()
    })

    it('returns review as is when within limit', () => {
      const shortReview = 'Livro excelente! Vale muito a leitura.'
      expect(buildReviewExcerpt(shortReview, 200)).toBe(shortReview)
    })

    it('truncates review and adds ellipsis when exceeding limit', () => {
      const longReview = 'A'.repeat(250)
      const excerpt = buildReviewExcerpt(longReview, 200)
      expect(excerpt?.length).toBe(201) // 200 chars + '…'
      expect(excerpt?.endsWith('…')).toBe(true)
    })
  })

  describe('feedQuerySchema', () => {
    it('defaults limit to 10 when empty query', () => {
      const parsed = feedQuerySchema.parse({})
      expect(parsed.limit).toBe(10)
    })

    it('coerces string limit to number', () => {
      const parsed = feedQuerySchema.parse({ limit: '5' })
      expect(parsed.limit).toBe(5)
    })

    it('accepts limit = 1000 at schema level (capping handled in service)', () => {
      const parsed = feedQuerySchema.parse({ limit: '1000' })
      expect(parsed.limit).toBe(1000)
    })
  })
})
