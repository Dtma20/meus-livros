import { describe, expect, it } from 'vitest'
import { sanitizeClientErrorMessage } from '../../server/utils/client-error'

describe('sanitizeClientErrorMessage', () => {
  it('replaces line breaks before composing log messages', () => {
    expect(sanitizeClientErrorMessage('linha 1\r\nlinha 2\nlinha 3')).toBe('linha 1 linha 2 linha 3')
  })
})
