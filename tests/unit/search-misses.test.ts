import { beforeEach, describe, expect, it, vi } from 'vitest'

import { recordSearchMiss } from '../../server/services/search'
import { searchQuerySchema } from '../../shared/schemas/search'

const mockInsert = vi.fn()
const mockValues = vi.fn()

vi.mock('../../server/db', () => ({
  db: {
    insert: (...args: unknown[]) => {
      mockInsert(...args)
      return {
        values: (...valArgs: unknown[]) => mockValues(...valArgs),
      }
    },
  },
}))

describe('TASK-026: recordSearchMiss (unit)', () => {
  beforeEach(() => {
    mockInsert.mockClear()
    mockValues.mockClear()
  })

  it('ignores queries with length less than 2 characters (empty or single char)', async () => {
    await recordSearchMiss('')
    await recordSearchMiss('a')
    await recordSearchMiss('   ')
    await recordSearchMiss('  b  ')

    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockValues).not.toHaveBeenCalled()
  })

  it('trims query whitespace but preserves casing and accents without normalisation', async () => {
    mockValues.mockResolvedValueOnce([{ id: 1 }])

    await recordSearchMiss('  O Senhor dos Anéis (Edição Ilustrada)  ', 'user-123')

    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(mockValues).toHaveBeenCalledWith({
      query: 'O Senhor dos Anéis (Edição Ilustrada)',
      user_id: 'user-123',
    })
  })

  it('records null user_id for anonymous searches', async () => {
    mockValues.mockResolvedValueOnce([{ id: 2 }])

    await recordSearchMiss('Crime e Castigo')

    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(mockValues).toHaveBeenCalledWith({
      query: 'Crime e Castigo',
      user_id: null,
    })
  })

  it('catches and logs error when insert fails without rejecting or throwing', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockValues.mockRejectedValueOnce(new Error('Connection failure'))

    await expect(recordSearchMiss('Falha Simulada', null)).resolves.not.toThrow()

    expect(consoleSpy).toHaveBeenCalledWith(
      '[search] search_misses insert failed:',
      expect.any(Error),
    )
    consoleSpy.mockRestore()
  })
})

describe('TASK-026: searchQuerySchema (unit)', () => {
  it('trims leading and trailing whitespace from query', () => {
    const parsed = searchQuerySchema.parse({ q: '  Ensaio sobre a Cegueira  ' })
    expect(parsed.q).toBe('Ensaio sobre a Cegueira')
  })

  it('defaults to empty string when q is missing', () => {
    const parsed = searchQuerySchema.parse({})
    expect(parsed.q).toBe('')
  })

  it('accepts queries up to 100 characters', () => {
    const result = searchQuerySchema.safeParse({ q: 'a'.repeat(100) })
    expect(result.success).toBe(true)
  })

  it('rejects queries longer than 100 characters', () => {
    const result = searchQuerySchema.safeParse({ q: 'a'.repeat(101) })
    expect(result.success).toBe(false)
  })
})

