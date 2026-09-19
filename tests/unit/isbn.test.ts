import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { normalizeIsbn } from '../../server/utils/isbn'

describe('normalizeIsbn', () => {
  it('converts an ISBN-10 to a valid ISBN-13', () => {
    const result = normalizeIsbn('8535902775')
    expect(result).toBe('9788535902778')
  })

  it('accepts an X check character on an ISBN-10', () => {
    expect(normalizeIsbn('853251166X')).toBe('9788532511669')
  })

  it('leaves a valid ISBN-13 unchanged', () => {
    expect(normalizeIsbn('9788535902778')).toBe('9788535902778')
  })

  it('rejects an ISBN-13 whose checksum is wrong', () => {
    expect(normalizeIsbn('9788535902779')).toBeNull()
  })

  it('strips the trailing .0 a spreadsheet export leaves behind', () => {
    expect(normalizeIsbn('9788598078397.0')).toBe('9788598078397')
  })

  it('strips hyphens and spaces', () => {
    expect(normalizeIsbn('978-85-359-0277-8')).toBe('9788535902778')
    expect(normalizeIsbn(' 9788535902778 ')).toBe('9788535902778')
  })

  it('returns null for anything that is not an ISBN', () => {
    expect(normalizeIsbn('abc')).toBeNull()
    expect(normalizeIsbn('')).toBeNull()
    expect(normalizeIsbn(null)).toBeNull()
    expect(normalizeIsbn(undefined)).toBeNull()
  })

  it('returns null for an Amazon ASIN', () => {
    // The corpus stores three Kindle ASINs in the isbn field. They are not
    // ISBNs, so they must become null rather than a fabricated ISBN-13.
    expect(normalizeIsbn('B07PV188F2')).toBeNull()
  })
})

describe('normalizeIsbn against the real corpus', () => {
  const books = JSON.parse(fs.readFileSync('legacy/livros.json', 'utf8')) as {
    isbn: string
    title: string
  }[]

  it('normalises every identifier that is an ISBN and nulls the three that are not', () => {
    const normalised = books.map((b) => normalizeIsbn(b.isbn))
    const valid = normalised.filter((v): v is string => v !== null)

    expect(books).toHaveLength(86)
    expect(valid).toHaveLength(83)
    expect(normalised.filter((v) => v === null)).toHaveLength(3)
  })

  it('produces no collisions, which TASK-019 depends on', () => {
    const valid = books
      .map((b) => normalizeIsbn(b.isbn))
      .filter((v): v is string => v !== null)

    expect(new Set(valid).size).toBe(valid.length)
  })
})
