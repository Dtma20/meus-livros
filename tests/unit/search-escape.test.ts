import { describe, expect, it } from 'vitest'
import { escapeLikeWildcards } from '../../server/services/search'

describe('escapeLikeWildcards', () => {
  it('leaves plain text untouched', () => {
    expect(escapeLikeWildcards('dostoievski')).toBe('dostoievski')
    expect(escapeLikeWildcards('O retorno do rei')).toBe('O retorno do rei')
  })

  it('escapes % and _', () => {
    expect(escapeLikeWildcards('100%')).toBe('100\\%')
    expect(escapeLikeWildcards('a_b')).toBe('a\\_b')
  })

  it('escapes the backslash first so it cannot form an escape sequence', () => {
    expect(escapeLikeWildcards('a\\b')).toBe('a\\\\b')
    expect(escapeLikeWildcards('%\\_')).toBe('\\%\\\\\\_')
  })
})
