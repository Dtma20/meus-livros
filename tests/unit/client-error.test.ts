import { describe, expect, it } from 'vitest'
import { sanitizeClientErrorMessage, sanitizeClientErrorStack } from '../../server/utils/client-error'

describe('sanitizeClientErrorMessage', () => {
  it('replaces line breaks before composing log messages', () => {
    expect(sanitizeClientErrorMessage('linha 1\r\nlinha 2\nlinha 3')).toBe('linha 1 linha 2 linha 3')
  })
})

describe('sanitizeClientErrorStack', () => {
  it('keeps the stack readable across lines', () => {
    const stack = 'Error: falhou\n    at foo (app.js:1:1)\n    at bar (app.js:2:2)'

    expect(sanitizeClientErrorStack(stack)).toBe(
      'Error: falhou\n  at foo (app.js:1:1)\n  at bar (app.js:2:2)',
    )
  })

  it('indents every line so a forged entry cannot start at column zero', () => {
    const forged = 'Error: real\n[09:00:00] [ERROR] [auth] entrada forjada'

    const lines = sanitizeClientErrorStack(forged).split('\n')

    expect(lines).toHaveLength(2)
    expect(lines[1]).toBe('  [09:00:00] [ERROR] [auth] entrada forjada')
  })

  it('indents after a lone carriage return, which also returns the cursor to column zero', () => {
    const forged = 'Error: real\r[09:00:00] [ERROR] [auth] entrada forjada'

    expect(sanitizeClientErrorStack(forged)).not.toContain('\r')
    expect(sanitizeClientErrorStack(forged).split('\n')[1]).toBe(
      '  [09:00:00] [ERROR] [auth] entrada forjada',
    )
  })

  it('caps the number of lines kept', () => {
    const huge = Array.from({ length: 200 }, (_, i) => `at frame${i} (app.js:${i}:1)`).join('\n')

    expect(sanitizeClientErrorStack(huge).split('\n')).toHaveLength(50)
  })
})
