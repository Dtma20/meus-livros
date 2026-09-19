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
    }

    // Signed first_published_year test (-500) and text series_number ('1-2')
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
