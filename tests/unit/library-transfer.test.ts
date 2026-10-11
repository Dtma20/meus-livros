import { describe, expect, it, vi } from 'vitest'
import {
  formatSourceLabel,
  formatImportError,
  GENRE_SLUG_MAP,
  IDIOMA_ISO_REVERSE,
  ISO_IDIOMA,
  parseAuthors,
  parseFormat,
  parseImportVisibility,
  parseReadingDates,
} from '../../server/services/library-transfer'
import {
  importBatchItemSchema,
  importPagesSchema,
  livroItemSchema,
  livroJsonSchema,
} from '../../shared/schemas/export-import'

// These parsing tests never query PostgreSQL; fail on accidental database use.
vi.mock('../../server/db', () => ({ db: {} }))

describe('library-transfer unit tests', () => {
  describe('livroItemSchema validation', () => {
    it('validates a complete book record', () => {
      const valid = {
        title: 'O Pequeno Príncipe',
        author: 'Antoine de Saint-Exupéry',
        country: 'França',
        original_language: 'francês',
        year: 1943,
        publisher: 'Agir',
        pages: 96,
        read_in: 2023,
        rate: 5,
        review: 'Uma obra atemporal sobre a essência humana.',
        source: 'Físico',
        series_name: null,
        series_number: null,
        genre: ['Ficção', 'Fantasia'],
        isbn: '9788522031474',
        cover_url: 'https://example.com/cover.jpg',
      }

      const result = livroItemSchema.safeParse(valid)
      expect(result.success).toBe(true)
    })

    it('validates a minimal book record with only title and author', () => {
      const minimal = {
        title: 'Livro Sem Metadados',
        author: 'Autor Anônimo',
      }

      const result = livroItemSchema.safeParse(minimal)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.title).toBe('Livro Sem Metadados')
        expect(result.data.genre).toEqual([])
      }
    })

    it('rejects records missing title or author', () => {
      expect(livroItemSchema.safeParse({ author: 'Só Autor' }).success).toBe(false)
      expect(livroItemSchema.safeParse({ title: 'Só Título' }).success).toBe(false)
      expect(livroItemSchema.safeParse({ title: '', author: 'Autor' }).success).toBe(false)
    })

    it('validates rating strictly and rejects invalid values', () => {
      expect(livroItemSchema.safeParse({ title: 'T', author: 'A', rate: 3.7 }).success).toBe(false)
      expect(livroItemSchema.safeParse({ title: 'T', author: 'A', rate: 4.5 }).success).toBe(true)
      expect(livroItemSchema.safeParse({ title: 'T', author: 'A', rate: 5 }).success).toBe(true)
      expect(livroItemSchema.safeParse({ title: 'T', author: 'A', rate: 6 }).success).toBe(false)
    })

    it('validates publication year strictly and rejects invalid values', () => {
      expect(livroItemSchema.safeParse({ title: 'T', author: 'A', year: 99999 }).success).toBe(false)
      expect(livroItemSchema.safeParse({ title: 'T', author: 'A', year: -5000 }).success).toBe(false)
      expect(livroItemSchema.safeParse({ title: 'T', author: 'A', year: 'abc' }).success).toBe(false)
      expect(livroItemSchema.safeParse({ title: 'T', author: 'A', year: 1999.5 }).success).toBe(false)
      expect(livroItemSchema.safeParse({ title: 'T', author: 'A', year: 2021 }).success).toBe(true)
    })

    it('validates page count strictly and rejects invalid values', () => {
      expect(livroItemSchema.safeParse({ title: 'T', author: 'A', pages: 99999 }).success).toBe(false)
      expect(livroItemSchema.safeParse({ title: 'T', author: 'A', pages: 3.5 }).success).toBe(false)
      expect(livroItemSchema.safeParse({ title: 'T', author: 'A', pages: 'abc' }).success).toBe(false)
      expect(livroItemSchema.safeParse({ title: 'T', author: 'A', pages: 0 }).success).toBe(false)
      expect(livroItemSchema.safeParse({ title: 'T', author: 'A', pages: 100 }).success).toBe(true)
    })

    it('validates cover URL strictly and rejects non-https URLs', () => {
      expect(livroItemSchema.safeParse({ title: 'T', author: 'A', cover_url: 'javascript:alert(1)' }).success).toBe(false)
      expect(livroItemSchema.safeParse({ title: 'T', author: 'A', cover_url: 'http://exemplo.com/a.jpg' }).success).toBe(false)
      expect(livroItemSchema.safeParse({ title: 'T', author: 'A', cover_url: 'https://exemplo.com/a.jpg' }).success).toBe(true)
    })

    it('keeps valid visibility and rejects invalid visibility values', () => {
      const validPub = livroItemSchema.safeParse({ title: 'T', author: 'A', visibility: 'publico' })
      expect(validPub.success).toBe(true)
      const validPriv = livroItemSchema.safeParse({ title: 'T', author: 'A', visibility: 'privado' })
      expect(validPriv.success).toBe(true)
      if (validPriv.success) {
        expect(validPriv.data.visibility).toBe('privado')
      }
      expect(livroItemSchema.safeParse({ title: 'T', author: 'A', visibility: 'secreto' }).success).toBe(false)
      expect(livroItemSchema.safeParse({ title: 'T', author: 'A', visibility: 1 }).success).toBe(false)
    })

    it('rejects invalid types for started_on, genre and isbn', () => {
      expect(livroItemSchema.safeParse({ title: 'T', author: 'A', started_on: 20200101 }).success).toBe(false)
      expect(livroItemSchema.safeParse({ title: 'T', author: 'A', genre: 'Romance' }).success).toBe(false)
      expect(livroItemSchema.safeParse({ title: 'T', author: 'A', isbn: 123 }).success).toBe(false)
    })

    it('treats a missing visibility as absent', () => {
      const result = livroItemSchema.safeParse({ title: 'T', author: 'A' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.visibility).toBeUndefined()
      }
    })

    it('accepts country_code and keeps old exports without country_code valid', () => {
      const withCode = livroJsonSchema.safeParse({ title: 'T', author: 'A', country: 'Brasil', country_code: 'BR' })
      expect(withCode.success).toBe(true)
      if (withCode.success) {
        expect(withCode.data.country_code).toBe('BR')
      }

      const withNullCode = livroJsonSchema.safeParse({ title: 'T', author: 'A', country_code: null })
      expect(withNullCode.success).toBe(true)
      if (withNullCode.success) {
        expect(withNullCode.data.country_code).toBeNull()
      }

      const withoutCode = livroJsonSchema.safeParse({ title: 'T', author: 'A' })
      expect(withoutCode.success).toBe(true)
      if (withoutCode.success) {
        expect(withoutCode.data.country_code).toBeUndefined()
      }
    })

    it('accepts null and undefined in source and format fields', () => {
      const withNullSource = livroJsonSchema.safeParse({ title: 'T', author: 'A', source: null })
      expect(withNullSource.success).toBe(true)
      if (withNullSource.success) {
        expect(withNullSource.data.source).toBeNull()
      }

      const withNullFormat = livroJsonSchema.safeParse({ title: 'T', author: 'A', format: null })
      expect(withNullFormat.success).toBe(true)
      if (withNullFormat.success) {
        expect(withNullFormat.data.format).toBeNull()
      }
    })

    it('accepts author field up to 1008 characters and rejects beyond that', () => {
      const a200_1 = 'A'.repeat(200)
      const a200_2 = 'B'.repeat(200)
      const a200_3 = 'C'.repeat(200)
      const threeAuthors = `${a200_1}, ${a200_2}, ${a200_3}`
      expect(threeAuthors.length).toBe(604)

      const result604 = livroJsonSchema.safeParse({ title: 'T', author: threeAuthors })
      expect(result604.success).toBe(true)

      const a1008 = 'A'.repeat(1008)
      expect(livroJsonSchema.safeParse({ title: 'T', author: a1008 }).success).toBe(true)

      const a1009 = 'A'.repeat(1009)
      expect(livroJsonSchema.safeParse({ title: 'T', author: a1009 }).success).toBe(false)
    })
  })

  describe('importBatchItemSchema validation', () => {
    it('validates minimal record with title and author', () => {
      expect(importBatchItemSchema.safeParse({ title: 'T', author: 'A' }).success).toBe(true)
    })

    it('rejects records missing title or author', () => {
      expect(importBatchItemSchema.safeParse({ author: 'Só Autor' }).success).toBe(false)
      expect(importBatchItemSchema.safeParse({ title: 'Só Título' }).success).toBe(false)
      expect(importBatchItemSchema.safeParse({ title: '', author: 'Autor' }).success).toBe(false)
    })

    it('passes through any other field as unknown so batch is not rejected', () => {
      expect(importBatchItemSchema.safeParse({ title: 'T', author: 'A', rate: 3.7 }).success).toBe(true)
      expect(importBatchItemSchema.safeParse({ title: 'T', author: 'A', year: 'abc' }).success).toBe(true)
      expect(importBatchItemSchema.safeParse({ title: 'T', author: 'A', pages: 3.5 }).success).toBe(true)
      expect(importBatchItemSchema.safeParse({ title: 'T', author: 'A', cover_url: 'http://x' }).success).toBe(true)
      expect(importBatchItemSchema.safeParse({ title: 'T', author: 'A', visibility: 1 }).success).toBe(true)
      expect(importBatchItemSchema.safeParse({ title: 'T', author: 'A', visibility: 'secreto' }).success).toBe(true)
      expect(importBatchItemSchema.safeParse({ title: 'T', author: 'A', started_on: 20200101 }).success).toBe(true)
      expect(importBatchItemSchema.safeParse({ title: 'T', author: 'A', genre: 'Romance' }).success).toBe(true)
      expect(importBatchItemSchema.safeParse({ title: 'T', author: 'A', isbn: 123 }).success).toBe(true)
    })
  })

  describe('parseImportVisibility', () => {
    it('keeps each valid visibility', () => {
      expect(parseImportVisibility('privado')).toBe('privado')
      expect(parseImportVisibility('publico')).toBe('publico')
    })

    it('defaults to publico when the field is absent', () => {
      expect(parseImportVisibility(undefined)).toBe('publico')
      expect(parseImportVisibility(null)).toBe('publico')
    })

    it('rejects values outside the enum', () => {
      expect(() => parseImportVisibility('secreto')).toThrow()
      expect(() => parseImportVisibility('Privado')).toThrow()
      expect(() => parseImportVisibility('')).toThrow()
    })
  })

  it('formats import errors without database details', () => {
    const message = formatImportError(7, 'Livro de teste')

    expect(message).toBe('Livro #7 ("Livro de teste"): não foi possível importar.')
    expect(message).not.toMatch(/constraint|violates|column|relation/i)
  })

  describe('parseAuthors helper', () => {
    it('splits multiple authors on comma, semicolon, and " e "', () => {
      expect(parseAuthors('J.R.R. Tolkien')).toEqual(['J.R.R. Tolkien'])
      expect(parseAuthors('Karl Marx, Friedrich Engels')).toEqual(['Karl Marx', 'Friedrich Engels'])
      expect(parseAuthors('Neil Gaiman e Terry Pratchett')).toEqual(['Neil Gaiman', 'Terry Pratchett'])
      expect(parseAuthors('Autor 1; Autor 2 / Autor 3')).toEqual(['Autor 1', 'Autor 2', 'Autor 3'])
      expect(parseAuthors('')).toEqual([])
    })
  })

  describe('parseFormat and formatSourceLabel', () => {
    it('correctly maps source string to enum format', () => {
      expect(parseFormat('Físico')).toBe('fisico')
      expect(parseFormat('Kindle')).toBe('ebook')
      expect(parseFormat('e-book')).toBe('ebook')
      expect(parseFormat('Digital')).toBe('ebook')
      expect(parseFormat('Audiobook')).toBe('audio')
      expect(parseFormat(null)).toBeNull()
      expect(parseFormat(undefined)).toBeNull()
      expect(parseFormat()).toBeNull()
      expect(parseFormat('')).toBeNull()
      expect(parseFormat('   ')).toBeNull()
    })

    it('correctly maps enum format to human-readable label', () => {
      expect(formatSourceLabel('fisico')).toBe('Físico')
      expect(formatSourceLabel('ebook')).toBe('Kindle')
      expect(formatSourceLabel('audio')).toBe('Audiobook')
      expect(formatSourceLabel(null)).toBeNull()
      expect(formatSourceLabel(undefined)).toBeNull()
    })
  })

  describe('language and genre mappings', () => {
    it('maps language names to ISO and back', () => {
      expect(ISO_IDIOMA['inglês']).toBe('en')
      expect(ISO_IDIOMA['português']).toBe('pt')
      expect(IDIOMA_ISO_REVERSE['en']).toBe('inglês')
      expect(IDIOMA_ISO_REVERSE['pt']).toBe('português')
    })

    it('contains essential genre mappings', () => {
      expect(GENRE_SLUG_MAP['Ficção']).toBe('ficcao')
      expect(GENRE_SLUG_MAP['Não-Ficção']).toBe('nao-ficcao')
      expect(GENRE_SLUG_MAP['Sci-fi']).toBe('ficcao-cientifica')
      expect(GENRE_SLUG_MAP['Distopia']).toBe('distopia')
    })
  })

  describe('finish precision without a finish date', () => {
    const NOW = new Date('2026-10-10T12:00:00Z')
    const base = { title: 'T', author: 'A', genre: [] }

    it('keeps the precision the file gives', () => {
      expect(parseReadingDates({ ...base, finished_precision: 'mes' }, NOW))
        .toEqual({ ok: true, startedOn: null, finishedOn: null, finishedPrecision: 'mes' })
    })

    it('uses "dia", the default of a manual reading, when the file gives no precision', () => {
      expect(parseReadingDates(base, NOW))
        .toEqual({ ok: true, startedOn: null, finishedOn: null, finishedPrecision: 'dia' })
    })
  })

  describe('importPagesSchema', () => {
    it('accepts positive page counts up to the ceiling of 50000', () => {
      expect(importPagesSchema.safeParse(1).success).toBe(true)
      expect(importPagesSchema.safeParse(50000).success).toBe(true)
    })

    it('rejects page count above 50000', () => {
      const result = importPagesSchema.safeParse(50001)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]?.message).toBe('Número de páginas superior a 50.000.')
    })

    it('rejects non-positive page count', () => {
      expect(importPagesSchema.safeParse(0).success).toBe(false)
      expect(importPagesSchema.safeParse(-5).success).toBe(false)
    })
  })
})
