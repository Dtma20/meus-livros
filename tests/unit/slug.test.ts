import { describe, expect, it } from 'vitest'
import { slugify, uniqueSlug } from '../../server/utils/slug'

describe('slugify', () => {
  it('strips accents and lowercases', () => {
    expect(slugify('Ficção Científica')).toBe('ficcao-cientifica')
    expect(slugify('Não Ficção')).toBe('nao-ficcao')
    expect(slugify('O Pequeno Príncipe')).toBe('o-pequeno-principe')
  })

  it('collapses punctuation and repeated separators', () => {
    expect(slugify('Dom Casmurro — 2ª edição!')).toBe('dom-casmurro-2a-edicao')
    expect(slugify('  espaços   demais  ')).toBe('espacos-demais')
  })

  it('returns an empty string when nothing survives', () => {
    expect(slugify('!!!')).toBe('')
  })
})

describe('uniqueSlug', () => {
  it('returns the plain slug when it is free', async () => {
    const result = await uniqueSlug('Ficção Científica', async () => false)
    expect(result).toBe('ficcao-cientifica')
  })

  it('suffixes from 2 upward on collision', async () => {
    const used = new Set(['duna', 'duna-2'])
    const result = await uniqueSlug('Duna', async (candidate) => used.has(candidate))
    expect(result).toBe('duna-3')
  })

  it('falls back to a usable base when the text slugifies to nothing', async () => {
    const result = await uniqueSlug('!!!', async () => false)
    expect(result).toBe('item')
  })
})
