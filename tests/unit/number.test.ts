import { describe, expect, it } from 'vitest'
import { formatThousands } from '../../app/utils/number'

describe('formatThousands', () => {
  it('groups thousands with a dot, the same on server and client', () => {
    expect(formatThousands(0)).toBe('0')
    expect(formatThousands(999)).toBe('999')
    expect(formatThousands(3400)).toBe('3.400')
    expect(formatThousands(1234567)).toBe('1.234.567')
  })

  it('keeps the sign and drops decimals', () => {
    expect(formatThousands(-1500)).toBe('-1.500')
    expect(formatThousands(1234.9)).toBe('1.234')
  })
})
