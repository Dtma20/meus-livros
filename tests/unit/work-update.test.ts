import { describe, expect, it } from 'vitest'
import {
  editionUpdateSchema,
  hasField,
  workUpdateSchema,
} from '../../shared/schemas/work'
import { COUNTRIES, countryCodeFor, countryLabelFor } from '../../shared/constants/countries'

/**
 * These tests pin the one behaviour the PATCH routes are built on: an absent
 * key and an explicit null are different instructions. If Zod ever stops
 * preserving that, a form editing only the title starts blanking every other
 * column and nothing else in the suite would notice.
 */
describe('workUpdateSchema — PATCH semantics', () => {
  it('omits keys that were not sent', () => {
    const parsed = workUpdateSchema.parse({ title: 'Dom Casmurro' })

    expect(hasField(parsed, 'title')).toBe(true)
    expect(hasField(parsed, 'series_name')).toBe(false)
    expect(hasField(parsed, 'first_published_year')).toBe(false)
    expect(hasField(parsed, 'genre_ids')).toBe(false)
  })

  it('keeps an explicit null, which is how a field is cleared', () => {
    const parsed = workUpdateSchema.parse({ series_name: null, series_number: null })

    expect(hasField(parsed, 'series_name')).toBe(true)
    expect(parsed.series_name).toBeNull()
    expect(hasField(parsed, 'series_number')).toBe(true)
  })

  it('treats an undefined value as absent, not as a clear', () => {
    // JSON cannot carry undefined, but the schema is also parsed in the form
    // and in tests, where it can. A stray undefined must not write NULL over a
    // real value.
    const parsed = workUpdateSchema.parse({ title: 'Dom Casmurro', series_name: undefined })

    expect(hasField(parsed, 'series_name')).toBe(false)
  })

  it('rejects an empty body', () => {
    expect(workUpdateSchema.safeParse({}).success).toBe(false)
  })

  it('accepts a negative first_published_year', () => {
    const parsed = workUpdateSchema.parse({ first_published_year: -500 })
    expect(parsed.first_published_year).toBe(-500)
  })

  it('accepts a non-numeric series_number', () => {
    expect(workUpdateSchema.parse({ series_number: '1-2' }).series_number).toBe('1-2')
    expect(workUpdateSchema.parse({ series_number: '0.1' }).series_number).toBe('0.1')
  })

  it('rejects a title that is only whitespace', () => {
    expect(workUpdateSchema.safeParse({ title: '   ' }).success).toBe(false)
  })

  it('rejects an empty authors array', () => {
    expect(workUpdateSchema.safeParse({ authors: [] }).success).toBe(false)
  })

  it('rejects a genre id outside the smallint range', () => {
    // genres.id is smallint. Unbounded, 99999 reaches Postgres and the caller
    // gets a 500 for what is really a 400.
    expect(workUpdateSchema.safeParse({ genre_ids: [99999] }).success).toBe(false)
    expect(workUpdateSchema.safeParse({ genre_ids: [0] }).success).toBe(false)
    expect(workUpdateSchema.safeParse({ genre_ids: [-1] }).success).toBe(false)
    expect(workUpdateSchema.safeParse({ genre_ids: [1, 32767] }).success).toBe(true)
  })

  it('does not accept slug or ol_work_key', () => {
    const parsed = workUpdateSchema.parse({
      title: 'Dom Casmurro',
      slug: 'outro-slug',
      ol_work_key: 'OL999W',
    } as Record<string, unknown>)

    expect(hasField(parsed, 'slug')).toBe(false)
    expect(hasField(parsed, 'ol_work_key')).toBe(false)
  })
})

describe('editionUpdateSchema', () => {
  it('omits absent keys and keeps explicit nulls', () => {
    const parsed = editionUpdateSchema.parse({ publisher: null })

    expect(hasField(parsed, 'publisher')).toBe(true)
    expect(parsed.publisher).toBeNull()
    expect(hasField(parsed, 'isbn')).toBe(false)
    expect(hasField(parsed, 'page_count')).toBe(false)
  })

  it('rejects a non-https cover URL', () => {
    expect(editionUpdateSchema.safeParse({ cover_url: 'http://exemplo.com/capa.jpg' }).success)
      .toBe(false)
    expect(editionUpdateSchema.safeParse({ cover_url: 'javascript:alert(1)' }).success)
      .toBe(false)
    expect(editionUpdateSchema.safeParse({ cover_url: 'data:image/png;base64,AAAA' }).success)
      .toBe(false)
  })

  it('accepts an https cover URL and a null one', () => {
    expect(editionUpdateSchema.safeParse({ cover_url: 'https://exemplo.com/capa.jpg' }).success)
      .toBe(true)
    expect(editionUpdateSchema.safeParse({ cover_url: null }).success).toBe(true)
  })

  it('rejects a non-positive page_count', () => {
    expect(editionUpdateSchema.safeParse({ page_count: 0 }).success).toBe(false)
    expect(editionUpdateSchema.safeParse({ page_count: -10 }).success).toBe(false)
  })

  it('rejects an empty body', () => {
    expect(editionUpdateSchema.safeParse({}).success).toBe(false)
  })
})

describe('hasField', () => {
  it('separates absent, null and undefined', () => {
    expect(hasField({ a: 1 }, 'a')).toBe(true)
    expect(hasField({ a: null }, 'a')).toBe(true)
    expect(hasField({ a: undefined }, 'a')).toBe(false)
    expect(hasField({}, 'a')).toBe(false)
  })
})

describe('country options', () => {
  it('exposes ISO alpha-2 codes with pt-BR labels', () => {
    const brazil = COUNTRIES.find((c) => c.code === 'BR')
    expect(brazil).toBeDefined()
    expect(brazil?.label).toBe('Brasil')
  })

  it('resolves a typed country name to its code, case-insensitively', () => {
    expect(countryCodeFor('Brasil')).toBe('BR')
    expect(countryCodeFor('brasil')).toBe('BR')
    expect(countryCodeFor('  Alemanha  ')).toBe('DE')
  })

  it('accepts a code typed directly', () => {
    expect(countryCodeFor('br')).toBe('BR')
    expect(countryCodeFor('US')).toBe('US')
  })

  it('returns null for a place with no ISO code, which is a real corpus value', () => {
    expect(countryCodeFor('Roma Antiga')).toBeNull()
    expect(countryCodeFor('')).toBeNull()
    expect(countryCodeFor(null)).toBeNull()
  })

  it('labels a code, and falls back to the code itself when unknown', () => {
    expect(countryLabelFor('BR')).toBe('Brasil')
    expect(countryLabelFor('br')).toBe('Brasil')
    expect(countryLabelFor('ZZ')).toBe('ZZ')
    expect(countryLabelFor(null)).toBeNull()
  })
})
