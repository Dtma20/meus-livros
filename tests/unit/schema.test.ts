import { describe, expect, it } from 'vitest'
import type {
  AllowedEmail,
  Author,
  BookFormat,
  DatePrecision,
  Edition,
  Genre,
  GenreKind,
  NewAllowedEmail,
  NewAuthor,
  NewEdition,
  NewGenre,
  NewReadingLog,
  NewSearchMiss,
  NewUser,
  NewWork,
  NewWorkAuthor,
  NewWorkGenre,
  ReadingLog,
  SearchMiss,
  User,
  Visibility,
  Work,
  WorkAuthor,
  WorkGenre,
} from '../../server/db/types'
import { logDateSchema, logInputSchema } from '../../shared/schemas/log'
import { readingBlockInputSchema, updateReadingBlockInputSchema } from '../../shared/schemas/reading-block'
import { authorInputSchema, countryCodeSchema, coverUrlSchema } from '../../shared/schemas/work'

describe('Schema types compilation and usability', () => {
  it('constructs an object of every inferred select and insert type', () => {
    const visibility: Visibility = 'publico'
    const datePrecision: DatePrecision = 'dia'
    const bookFormat: BookFormat = 'fisico'
    const genreKind: GenreKind = 'ficcao'

    const user: User = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      email: 'reader@example.com',
      handle: 'reader',
      display_name: 'Leitor Teste',
      bio: 'Bio do leitor',
      profile_visibility: visibility,
      is_admin: false,
      created_at: new Date('2026-01-01T00:00:00Z'),
    }

    const newUser: NewUser = {
      email: 'reader@example.com',
      handle: 'reader',
      display_name: 'Leitor Teste',
    }

    const allowedEmail: AllowedEmail = {
      email: 'invited@example.com',
      invited_by: user.id,
      note: 'Convite pessoal',
      created_at: new Date('2026-01-01T00:00:00Z'),
    }

    const newAllowedEmail: NewAllowedEmail = {
      email: 'invited@example.com',
    }

    const author: Author = {
      id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      name: 'Machado de Assis',
      slug: 'machado-de-assis',
      country_code: 'BR',
      country_label: 'Brasil',
      created_by: user.id,
      created_at: new Date('2026-01-01T00:00:00Z'),
    }

    const newAuthor: NewAuthor = {
      name: 'Machado de Assis',
      slug: 'machado-de-assis',
    }

    const work: Work = {
      id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      slug: 'dom-casmurro',
      title: 'Dom Casmurro',
      original_language: 'pt',
      first_published_year: 1899,
      series_name: null,
      series_number: null,
      ol_work_key: 'OL12345W',
      created_by: user.id,
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_by: null,
      updated_at: null,
    }

    const ancientWork: Work = {
      id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a34',
      slug: 'arte-da-guerra',
      title: 'A Arte da Guerra',
      original_language: 'zh',
      first_published_year: -500,
      series_name: 'Pollyanna',
      series_number: '1-2',
      ol_work_key: null,
      created_by: null,
      created_at: new Date('2026-01-01T00:00:00Z'),

      updated_by: null,
      updated_at: null,
    }

    const newWork: NewWork = {
      slug: 'dom-casmurro',
      title: 'Dom Casmurro',
      first_published_year: -500,
      series_number: '0.1',
    }

    const workAuthor: WorkAuthor = {
      work_id: work.id,
      author_id: author.id,
      position: 0,
    }

    const newWorkAuthor: NewWorkAuthor = {
      work_id: work.id,
      author_id: author.id,
    }

    const edition: Edition = {
      id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
      work_id: work.id,
      isbn13: '9788535914849',
      publisher: 'Companhia das Letras',
      page_count: 256,
      published_year: 2008,
      language: 'pt',
      cover_url: 'https://covers.openlibrary.org/b/id/123-L.jpg',
      ol_cover_id: 123,
      created_by: user.id,
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_by: null,
      updated_at: null,
    }

    const newEdition: NewEdition = {
      work_id: work.id,
      isbn13: null,
    }

    const genre: Genre = {
      id: 1,
      slug: 'ficcao',
      label_pt: 'Ficção',
      kind: genreKind,
    }

    const newGenre: NewGenre = {
      id: 1,
      slug: 'ficcao',
      label_pt: 'Ficção',
      kind: 'ficcao',
    }

    const workGenre: WorkGenre = {
      work_id: work.id,
      genre_id: genre.id,
    }

    const newWorkGenre: NewWorkGenre = {
      work_id: work.id,
      genre_id: genre.id,
    }

    const readingLog: ReadingLog = {
      id: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
      user_id: user.id,
      work_id: work.id,
      edition_id: edition.id,
      rating: '4.5',
      review: 'Excelente releitura.',
      started_on: '2026-01-01',
      finished_on: '2026-01-10',
      finished_precision: datePrecision,
      format: bookFormat,
      visibility,
      created_at: new Date('2026-01-10T12:00:00Z'),
      updated_at: new Date('2026-01-10T12:00:00Z'),
    }

    const newReadingLog: NewReadingLog = {
      user_id: user.id,
      work_id: work.id,
      rating: '5.0',
    }

    const searchMiss: SearchMiss = {
      id: 1,
      query: 'livro inexistente',
      user_id: user.id,
      created_at: new Date('2026-01-10T12:00:00Z'),
    }

    const newSearchMiss: NewSearchMiss = {
      query: 'livro inexistente',
    }

    expect(user.id).toBe('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
    expect(newUser.handle).toBe('reader')
    expect(allowedEmail.email).toBe('invited@example.com')
    expect(newAllowedEmail.email).toBe('invited@example.com')
    expect(author.name).toBe('Machado de Assis')
    expect(newAuthor.slug).toBe('machado-de-assis')
    expect(work.title).toBe('Dom Casmurro')
    expect(ancientWork.first_published_year).toBe(-500)
    expect(ancientWork.series_number).toBe('1-2')
    expect(newWork.first_published_year).toBe(-500)
    expect(workAuthor.position).toBe(0)
    expect(newWorkAuthor.work_id).toBe(work.id)
    expect(edition.isbn13).toBe('9788535914849')
    expect(newEdition.isbn13).toBeNull()
    expect(genre.slug).toBe('ficcao')
    expect(newGenre.kind).toBe('ficcao')
    expect(workGenre.genre_id).toBe(1)
    expect(newWorkGenre.work_id).toBe(work.id)
    expect(readingLog.rating).toBe('4.5')
    expect(newReadingLog.rating).toBe('5.0')
    expect(searchMiss.query).toBe('livro inexistente')
    expect(newSearchMiss.query).toBe('livro inexistente')
  })
})

describe('Log and reading block dates and page numbers', () => {
  it.each(['2026-02-31', '2025-13-45', '0000-00-00', '2025-02-29', '2026-00-10'])(
    'rejects %s as a log date because it is not a calendar date',
    (date) => {
      const result = logDateSchema.safeParse(date)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]?.message).toBe('Data inválida.')
    },
  )

  it('accepts real calendar dates, including a leap day', () => {
    expect(logDateSchema.safeParse('2024-02-29').success).toBe(true)
    expect(logDateSchema.safeParse('2026-02-28').success).toBe(true)
  })

  it('rejects an impossible finished_on in the log input', () => {
    const result = logInputSchema.safeParse({
      work_id: '11111111-1111-4111-8111-111111111111',
      finished_on: '2026-02-31',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues.find((issue) => issue.path[0] === 'finished_on')?.message).toBe('Data inválida.')
  })

  it('rejects impossible read_at dates on reading blocks, create and update', () => {
    const created = readingBlockInputSchema.safeParse({ start_page: 1, end_page: 10, read_at: '2026-02-31' })
    expect(created.success).toBe(false)
    expect(created.error?.issues.find((issue) => issue.path[0] === 'read_at')?.message).toBe('Data inválida.')

    const updated = updateReadingBlockInputSchema.safeParse({ read_at: '0000-00-00' })
    expect(updated.success).toBe(false)
  })

  it('caps reading block page numbers at 100000 on create and update', () => {
    const tooLarge = readingBlockInputSchema.safeParse({ start_page: 1, end_page: 100001 })
    expect(tooLarge.success).toBe(false)
    expect(tooLarge.error?.issues.map((issue) => issue.message)).toContain('Número de páginas grande demais.')

    expect(readingBlockInputSchema.safeParse({ start_page: 1, end_page: 100000 }).success).toBe(true)
    expect(readingBlockInputSchema.safeParse({ start_page: 100001, end_page: 100001 }).success).toBe(false)
    expect(updateReadingBlockInputSchema.safeParse({ end_page: 100001 }).success).toBe(false)
    expect(updateReadingBlockInputSchema.safeParse({ start_page: 100001 }).success).toBe(false)
  })
})

describe('Work schema validation', () => {
  it('trims whitespace from coverUrlSchema and preserves valid https URL', () => {
    expect(coverUrlSchema.parse(' https://x.com/a.jpg ')).toBe('https://x.com/a.jpg')
  })

  it('rejects coverUrlSchema without https after trimming', () => {
    expect(coverUrlSchema.safeParse(' http://x.com/a.jpg ').success).toBe(false)
    expect(coverUrlSchema.safeParse('   ').success).toBe(false)
  })

  it('rejects unknown country_code in authorInputSchema with "País inválido."', () => {
    const result = authorInputSchema.safeParse({ name: 'Clarice Lispector', country_code: 'xx' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('País inválido.')
  })

  it('normalizes country_code to uppercase in authorInputSchema', () => {
    const result = authorInputSchema.parse({ name: 'Clarice Lispector', country_code: 'br' })
    expect(result.country_code).toBe('BR')
  })

  it('accepts valid uppercase country_code in countryCodeSchema', () => {
    const result = countryCodeSchema.parse('US')
    expect(result).toBe('US')
  })

  it('rejects unknown country_code in countryCodeSchema with "País inválido."', () => {
    const result = countryCodeSchema.safeParse('xx')
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('País inválido.')
  })
})
