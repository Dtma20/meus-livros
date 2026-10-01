import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  brToText,
  GENRE_SLUG_MAP,
  ISO_IDIOMA,
  type LivroJson,
  parseAuthors,
  parseFormat,
  validateLivros,
} from '../../scripts/migrate-livros'
import { normalizeIsbn } from '../../server/utils/isbn'

vi.mock('../../server/db', () => ({ db: {} }))

describe('migrate-livros unit logic and parsing', () => {
  describe('brToText', () => {
    it('converts double break to double newline and single break to single newline', () => {
      const input = 'Primeiro parágrafo.<br><br>Segundo parágrafo.<br>Linha seguinte.'
      const output = brToText(input)
      expect(output).toBe('Primeiro parágrafo.\n\nSegundo parágrafo.\nLinha seguinte.')
      expect(output).not.toContain('<')
    })

    it('handles self-closing and spaced break tags', () => {
      const input = 'Linha 1<br/>Linha 2<br />Linha 3<br  /><br  />Linha 4'
      const output = brToText(input)
      expect(output).toBe('Linha 1\nLinha 2\nLinha 3\n\nLinha 4')
      expect(output).not.toContain('<')
    })

    it('throws error when HTML tags other than br are detected (injection protection)', () => {
      expect(() => brToText('Texto com <script>alert(1)</script>')).toThrow(/possible HTML injection/)
      expect(() => brToText('Texto com <p>paragrafo</p>')).toThrow(/possible HTML injection/)
      expect(() => brToText('Texto com <a href="evil">link</a>')).toThrow(/possible HTML injection/)
    })
  })

  describe('parseAuthors', () => {
    it('handles single authors, commas, and " e "', () => {
      expect(parseAuthors('J.R.R. Tolkien')).toEqual(['J.R.R. Tolkien'])
      expect(parseAuthors('Pierre Weil, Roland Tompakow')).toEqual(['Pierre Weil', 'Roland Tompakow'])
      expect(parseAuthors('Autor 1 e Autor 2')).toEqual(['Autor 1', 'Autor 2'])
    })

    it('trims whitespace and ignores empty elements', () => {
      expect(parseAuthors('  Autor A ,   Autor B  ')).toEqual(['Autor A', 'Autor B'])
      expect(parseAuthors('  Autor X  e  Autor Y  ')).toEqual(['Autor X', 'Autor Y'])
    })
  })

  describe('parseFormat', () => {
    it('maps Físico and Ebook to canonical database enum values', () => {
      expect(parseFormat('Físico')).toBe('fisico')
      expect(parseFormat('Ebook')).toBe('ebook')
    })

    it('throws an error for unmapped or unknown format', () => {
      expect(() => parseFormat('Audiolivro')).toThrow(/Formato desconhecido/)
      expect(() => parseFormat('PDF')).toThrow(/Formato desconhecido/)
    })
  })

  describe('validateLivros', () => {
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'legacy/livros.json'), 'utf-8')
    const validLivros: LivroJson[] = JSON.parse(raw)

    it('passes cleanly on actual legacy/livros.json dataset (86 entries)', () => {
      expect(() => validateLivros(validLivros)).not.toThrow()
    })

    it('aborts if count is not 86', () => {
      expect(() => validateLivros(validLivros.slice(0, 10))).toThrow(/Esperado 86 registros/)
      expect(() => validateLivros([...validLivros, validLivros[0]!])).toThrow(/Esperado 86 registros/)
    })

    it('aborts if an unmapped genre is introduced', () => {
      const modified: LivroJson[] = JSON.parse(JSON.stringify(validLivros))
      modified[0]!.genre.push('GeneroInexistente')
      expect(() => validateLivros(modified)).toThrow(/gênero desconhecido "GeneroInexistente"/)
    })

    it('aborts if an unmapped country is introduced', () => {
      const modified: LivroJson[] = JSON.parse(JSON.stringify(validLivros))
      modified[0]!.country = 'Atlantida'
      expect(() => validateLivros(modified)).toThrow(/país desconhecido "Atlantida"/)
    })

    it('aborts if an unmapped original_language is introduced', () => {
      const modified: LivroJson[] = JSON.parse(JSON.stringify(validLivros))
      modified[0]!.original_language = 'Esperanto'
      expect(() => validateLivros(modified)).toThrow(/idioma desconhecido "Esperanto"/)
    })

    it('aborts if rating is outside 0.5-5.0 or has invalid decimal step', () => {
      const modified: LivroJson[] = JSON.parse(JSON.stringify(validLivros))
      modified[0]!.rate = 3.7
      expect(() => validateLivros(modified)).toThrow(/rate inválido: 3.7/)

      modified[0]!.rate = 5.5
      expect(() => validateLivros(modified)).toThrow(/rate inválido: 5.5/)

      modified[0]!.rate = 0.0
      expect(() => validateLivros(modified)).toThrow(/rate inválido: 0/)
    })
  })

  describe('legacy/livros.json dataset business invariants', () => {
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'legacy/livros.json'), 'utf-8')
    const livros: LivroJson[] = JSON.parse(raw)

    it('contains negative first-published year (-500) for ancient texts', () => {
      const ancient = livros.find((b) => b.year < 0)
      expect(ancient).toBeDefined()
      expect(ancient?.year).toBe(-500)
    })

    it('preserves textual and non-integer series_number values', () => {
      const omnibus = livros.find((b) => b.series_number === '1-2')
      expect(omnibus).toBeDefined()
      expect(omnibus?.title).toMatch(/Pollyanna/i)

      const prequel = livros.find((b) => b.series_number === '0.1')
      expect(prequel).toBeDefined()
    })

    it('has exactly 83 valid ISBN-13 and 3 null ASINs', () => {
      let validCount = 0
      let nullCount = 0
      for (const livro of livros) {
        const isbn13 = normalizeIsbn(livro.isbn)
        if (isbn13 !== null) {
          validCount++
        } else {
          nullCount++
        }
      }
      expect(validCount).toBe(83)
      expect(nullCount).toBe(3)
    })

    it('unrated books have rate === null, not 0', () => {
      const unrated = livros.filter((b) => b.rate === null)
      expect(unrated.length).toBeGreaterThanOrEqual(1)
      expect(livros.some((b) => b.rate === 0)).toBe(false)
    })

    it('all genres map to registered genre slugs', () => {
      for (const livro of livros) {
        for (const g of livro.genre) {
          expect(GENRE_SLUG_MAP[g]).toBeDefined()
        }
      }
    })

    it('all languages map to ISO codes', () => {
      for (const livro of livros) {
        expect(ISO_IDIOMA[livro.original_language.toLowerCase()]).toBeDefined()
      }
    })

  })
})
