import { describe, expect, it } from 'vitest'
import {
  emailSchema,
  isForbiddenPassword,
  resetPasswordSchema,
} from '../../shared/schemas/auth'

describe('emailSchema', () => {
  it('trims and lowercases valid email address', () => {
    expect(emailSchema.parse(' A@B.co ')).toBe('a@b.co')
  })

  it('rejects invalid email format with portuguese message', () => {
    const result = emailSchema.safeParse('ab')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Informe um e-mail válido.')
    }
  })

  it('rejects non-string input with portuguese message', () => {
    const result = emailSchema.safeParse(123)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Informe um e-mail válido.')
    }
  })

  it('rejects null and undefined with portuguese message', () => {
    const nullResult = emailSchema.safeParse(null)
    expect(nullResult.success).toBe(false)
    if (!nullResult.success) {
      expect(nullResult.error.issues[0]?.message).toBe('Informe um e-mail válido.')
    }

    const undefinedResult = emailSchema.safeParse(undefined)
    expect(undefinedResult.success).toBe(false)
    if (!undefinedResult.success) {
      expect(undefinedResult.error.issues[0]?.message).toBe('Informe um e-mail válido.')
    }
  })

  it('works inside resetPasswordSchema with untrimmed uppercase email', () => {
    const result = resetPasswordSchema.safeParse({
      email: ' Member@Example.com ',
      otp: '123456',
      password: 'StrongPassword123',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe('member@example.com')
    }
  })
})

describe('isForbiddenPassword', () => {
  it('detects common forbidden passwords', () => {
    expect(isForbiddenPassword('12345678')).toBe(true)
    expect(isForbiddenPassword('senha123')).toBe(true)
    expect(isForbiddenPassword('password')).toBe(true)
    expect(isForbiddenPassword('meuslivros')).toBe(true)
  })

  it('detects password equal to handle', () => {
    expect(isForbiddenPassword('myhandle', { handle: 'myhandle' })).toBe(true)
    expect(isForbiddenPassword('MYHANDLE', { handle: 'myhandle' })).toBe(true)
    expect(isForbiddenPassword('otherpassword', { handle: 'myhandle' })).toBe(false)
  })

  it('detects password equal to email local part', () => {
    expect(isForbiddenPassword('usuario', { email: 'usuario@example.com' })).toBe(true)
    expect(isForbiddenPassword('USUARIO', { email: 'usuario@example.com' })).toBe(true)
    expect(isForbiddenPassword('diferente123', { email: 'usuario@example.com' })).toBe(false)
  })
})
