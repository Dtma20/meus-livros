import { describe, expect, it } from 'vitest'
import {
  formatSourceLabel,
  formatImportError,
  GENRE_SLUG_MAP,
  IDIOMA_ISO_REVERSE,
  ISO_IDIOMA,
  parseAuthors,
  parseFormat,
} from '../../server/services/library-transfer'
import { livroJsonSchema } from '../../shared/schemas/export-import'

describe('library-transfer unit tests', () => {
  describe('livroJsonSchema validation', () => {
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

      const result = livroJsonSchema.safeParse(valid)
      expect(result.success).toBe(true)
    })

    it('validates a minimal book record with only title and author', () => {
      const minimal = {
        title: 'Livro Sem Metadados',
        author: 'Autor Anônimo',
      }

      const result = livroJsonSchema.safeParse(minimal)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.title).toBe('Livro Sem Metadados')
        expect(result.data.genre).toEqual([])
      }
    })

    it('rejects records missing title or author', () => {
      expect(livroJsonSchema.safeParse({ author: 'Só Autor' }).success).toBe(false)
      expect(livroJsonSchema.safeParse({ title: 'Só Título' }).success).toBe(false)
      expect(livroJsonSchema.safeParse({ title: '', author: 'Autor' }).success).toBe(false)
    })

    it('accepts only half-star ratings from 0.5 to 5', () => {
      expect(livroJsonSchema.safeParse({ title: 'T', author: 'A', rate: 3.7 }).success).toBe(false)
      expect(livroJsonSchema.safeParse({ title: 'T', author: 'A', rate: 0 }).success).toBe(false)
      expect(livroJsonSchema.safeParse({ title: 'T', author: 'A', rate: 4.5 }).success).toBe(true)
      expect(livroJsonSchema.safeParse({ title: 'T', author: 'A', rate: 6 }).success).toBe(false)
    })

    it('accepts only https cover URLs', () => {
      expect(livroJsonSchema.safeParse({ title: 'T', author: 'A', cover_url: 'javascript:alert(1)' }).success).toBe(false)
      expect(livroJsonSchema.safeParse({ title: 'T', author: 'A', cover_url: 'http://exemplo.com/a.jpg' }).success).toBe(false)
      expect(livroJsonSchema.safeParse({ title: 'T', author: 'A', cover_url: 'https://exemplo.com/a.jpg' }).success).toBe(true)
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
      expect(parseFormat(null)).toBe('fisico')
    })

    it('correctly maps enum format to human-readable label', () => {
      expect(formatSourceLabel('fisico')).toBe('Físico')
      expect(formatSourceLabel('ebook')).toBe('Kindle')
      expect(formatSourceLabel('audio')).toBe('Audiobook')
      expect(formatSourceLabel(null)).toBe('Físico')
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
})
