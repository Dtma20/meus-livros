import { describe, expect, it } from 'vitest'
import {
  readingBlockInputSchema,
  updateReadingBlockInputSchema,
} from '../../shared/schemas/reading-block'

describe('Reading block Zod schemas', () => {
  it('validates a correct reading block', () => {
    const input = {
      start_page: 45,
      end_page: 72,
      comment: 'Aqui começa a ficar mais evidente a desconfiança do narrador...',
      read_at: '2026-09-20',
    }
    const result = readingBlockInputSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.start_page).toBe(45)
      expect(result.data.end_page).toBe(72)
      expect(result.data.comment).toBe('Aqui começa a ficar mais evidente a desconfiança do narrador...')
    }
  })

  it('rejects when end_page < start_page', () => {
    const input = {
      start_page: 100,
      end_page: 50,
    }
    const result = readingBlockInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects when start_page is <= 0', () => {
    const input = {
      start_page: 0,
      end_page: 10,
    }
    const result = readingBlockInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects future dates', () => {
    const input = {
      start_page: 10,
      end_page: 20,
      read_at: '2099-01-01',
    }
    const result = readingBlockInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('validates update schema when end_page >= start_page', () => {
    const result = updateReadingBlockInputSchema.safeParse({
      start_page: 20,
      end_page: 40,
    })
    expect(result.success).toBe(true)
  })

  it('rejects update schema when end_page < start_page', () => {
    const result = updateReadingBlockInputSchema.safeParse({
      start_page: 50,
      end_page: 20,
    })
    expect(result.success).toBe(false)
  })
})
