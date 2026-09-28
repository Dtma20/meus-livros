import { describe, expect, it } from 'vitest'
import { languageLabel, statsQuerySchema } from '../../shared/schemas/stats'

describe('statsQuerySchema', () => {
  it('rejects non-numeric string values', () => {
    const result = statsQuerySchema.safeParse({ ano: 'abc' })
    expect(result.success).toBe(false)
  })

  it('coerces valid year string into number', () => {
    const result = statsQuerySchema.safeParse({ ano: '2025' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.ano).toBe(2025)
    }
  })

  it('accepts empty object when ano is omitted', () => {
    const result = statsQuerySchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.ano).toBeUndefined()
    }
  })

  it('accepts negative years within allowed range', () => {
    const result = statsQuerySchema.safeParse({ ano: '-500' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.ano).toBe(-500)
    }
  })

  it('accepts minimum and maximum boundaries', () => {
    const minResult = statsQuerySchema.safeParse({ ano: -9999 })
    const maxResult = statsQuerySchema.safeParse({ ano: 9999 })
    expect(minResult.success).toBe(true)
    expect(maxResult.success).toBe(true)
  })

  it('rejects numbers outside range or non-integers', () => {
    expect(statsQuerySchema.safeParse({ ano: -10000 }).success).toBe(false)
    expect(statsQuerySchema.safeParse({ ano: 10000 }).success).toBe(false)
    expect(statsQuerySchema.safeParse({ ano: 2025.5 }).success).toBe(false)
  })
})

describe('languageLabel', () => {
  it('translates known language codes to portuguese', () => {
    expect(languageLabel('en')).toBe('inglês')
    expect(languageLabel('pt')).toBe('português')
    expect(languageLabel('de')).toBe('alemão')
    expect(languageLabel('ru')).toBe('russo')
    expect(languageLabel('fr')).toBe('francês')
    expect(languageLabel('zh')).toBe('chinês')
    expect(languageLabel('he')).toBe('hebraico')
    expect(languageLabel('no')).toBe('norueguês')
    expect(languageLabel('la')).toBe('latim')
    expect(languageLabel('es')).toBe('espanhol')
    expect(languageLabel('ja')).toBe('japonês')
    expect(languageLabel('it')).toBe('italiano')
  })

  it('handles case-insensitive codes for known languages', () => {
    expect(languageLabel('EN')).toBe('inglês')
    expect(languageLabel('Pt')).toBe('português')
  })

  it('uppercases unknown language codes', () => {
    expect(languageLabel('xx')).toBe('XX')
    expect(languageLabel('esperanto')).toBe('ESPERANTO')
  })

  it('returns default text when code is null or empty', () => {
    expect(languageLabel(null)).toBe('Não informado')
    expect(languageLabel(undefined)).toBe('Não informado')
    expect(languageLabel('')).toBe('Não informado')
    expect(languageLabel('   ')).toBe('Não informado')
  })
})
