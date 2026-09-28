import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { livroJsonSchema, type LivroJson } from '../../shared/schemas/export-import'
import { removeFixtures } from './fixtures'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)
const MARKER = `zz-transfer-${Date.now()}`

describe.skipIf(!hasDatabaseUrl)('Library import and export integration tests', () => {
  let db: typeof import('../../server/db')['db']
  let client: typeof import('../../server/db')['client']
  let schema: typeof import('../../server/db/schema')
  let transferService: typeof import('../../server/services/library-transfer')
  let sqlOp: typeof import('drizzle-orm')

  let testUserId: string
  let roundtripUserId: string | null = null

  beforeAll(async () => {
    const dbModule = await import('../../server/db')
    db = dbModule.db
    client = dbModule.client
    schema = await import('../../server/db/schema')
    transferService = await import('../../server/services/library-transfer')
    sqlOp = await import('drizzle-orm')

    const [user] = await db
      .insert(schema.users)
      .values({
        email: `${MARKER}@example.com`,
        handle: `ut_${Date.now()}`.slice(0, 20),
        display_name: 'Usuário Transfer',
        profile_visibility: 'publico',
      })
      .returning({ id: schema.users.id })

    if (!user) throw new Error('Falha ao criar usuário de teste.')
    testUserId = user.id
  })

  afterAll(async () => {
    try {
      await removeFixtures(MARKER)
    } finally {
      await client?.end()
    }
  })

  it('imports books from JSON, creates works/editions/logs, and exports the library roundtrip', async () => {
    const sampleBooks: LivroJson[] = [
      {
        title: `${MARKER} Livro Completo`,
        author: 'Autor Teste Um, Autor Teste Dois',
        country: 'Brasil',
        original_language: 'português',
        year: 2021,
        publisher: 'Editora Modelo',
        pages: 350,
        read_in: 2023,
        rate: 4.5,
        review: 'Resenha excelente sobre o livro modelo.',
        source: 'Físico',
        series_name: 'Série Exemplo',
        series_number: '1',
        genre: ['Ficção', 'Aventura'],
        isbn: '9780000000019',
        cover_url: 'https://example.com/cover1.jpg',
      },
      {
        title: `${MARKER} Livro Minimal`,
        author: 'Escritor Solo',
        read_in: 2024,
        rate: 5,
        source: 'Kindle',
        genre: ['Romance'],
      },
      {

        title: `${MARKER} Livro Em Andamento`,
        author: 'Autora Paciente',
        source: 'Físico',
        genre: ['Novela'],
      },
    ]

    const result = await transferService.importUserLibrary(testUserId, sampleBooks)
    expect(result.importedCount).toBe(3)
    expect(result.skippedCount).toBe(0)
    expect(result.errors.length).toBe(0)

    const userLogs = await db
      .select({
        id: schema.reading_logs.id,
        workId: schema.reading_logs.work_id,
        rating: schema.reading_logs.rating,
        review: schema.reading_logs.review,
        format: schema.reading_logs.format,
      })
      .from(schema.reading_logs)
      .where(sqlOp.eq(schema.reading_logs.user_id, testUserId))

    expect(userLogs.length).toBe(3)

    const exportedBooks = await transferService.exportUserLibrary(testUserId)
    expect(exportedBooks.length).toBe(3)

    const book1 = exportedBooks.find((b) => b.title === `${MARKER} Livro Completo`)
    expect(book1).toBeDefined()
    expect(book1?.author).toContain('Autor Teste Um')
    expect(book1?.author).toContain('Autor Teste Dois')
    expect(book1?.rate).toBe(4.5)
    expect(book1?.review).toBe('Resenha excelente sobre o livro modelo.')
    expect(book1?.publisher).toBe('Editora Modelo')
    expect(book1?.pages).toBe(350)
    expect(book1?.source).toBe('Físico')
    expect(book1?.genre).toContain('Ficção')
    expect(book1?.genre).toContain('Aventura')

    const book2 = exportedBooks.find((b) => b.title === `${MARKER} Livro Minimal`)
    expect(book2).toBeDefined()
    expect(book2?.author).toBe('Escritor Solo')
    expect(book2?.rate).toBe(5)
    expect(book2?.source).toBe('Kindle')
    expect(book2?.genre).toContain('Romance')

    const inProgress = exportedBooks.find((b) => b.title === `${MARKER} Livro Em Andamento`)
    expect(inProgress).toBeDefined()
    expect(inProgress?.pages).toBeNull()
    expect(inProgress?.publisher).toBeNull()
    expect(inProgress?.isbn).toBeNull()
    expect(inProgress?.read_in).toBeNull()

    const reparsed = livroJsonSchema.array().safeParse(exportedBooks)
    expect(reparsed.success).toBe(true)

    const [roundtripUser] = await db
      .insert(schema.users)
      .values({
        email: `${MARKER}-roundtrip@example.com`,
        handle: `rt_${Date.now()}`.slice(0, 20),
        display_name: 'Usuário Roundtrip',
        profile_visibility: 'publico',
      })
      .returning({ id: schema.users.id })
    if (!roundtripUser) throw new Error('Falha ao criar usuário de round-trip.')
    roundtripUserId = roundtripUser.id

    const roundtrip = await transferService.importUserLibrary(roundtripUserId, exportedBooks)
    expect(roundtrip.errors).toEqual([])
    expect(roundtrip.skippedCount).toBe(0)
    expect(roundtrip.importedCount).toBe(exportedBooks.length)
  })

  it('exports and imports each reading with its own visibility', async () => {
    const [visibilityUser] = await db
      .insert(schema.users)
      .values({
        email: `${MARKER}-visibility@example.com`,
        handle: `uv_${Date.now()}`.slice(0, 20),
        display_name: 'Usuário Visibilidade',
        profile_visibility: 'publico',
      })
      .returning({ id: schema.users.id })
    if (!visibilityUser) throw new Error('Falha ao criar usuário de visibilidade.')

    const privateTitle = `${MARKER} Livro Privado`
    const unmarkedTitle = `${MARKER} Livro Sem Campo`
    const invalidTitle = `${MARKER} Livro Visibilidade Invalida`

    const result = await transferService.importUserLibrary(visibilityUser.id, [
      { title: privateTitle, author: 'Autor Visibilidade', genre: [], visibility: 'privado' },
      { title: unmarkedTitle, author: 'Autor Visibilidade', genre: [] },
      { title: invalidTitle, author: 'Autor Visibilidade', genre: [], visibility: 'secreto' },
    ])

    expect(result.importedCount).toBe(2)
    expect(result.skippedCount).toBe(1)
    expect(result.errors).toEqual([transferService.formatImportError(3, invalidTitle)])

    const stored = await db
      .select({ title: schema.works.title, visibility: schema.reading_logs.visibility })
      .from(schema.reading_logs)
      .innerJoin(schema.works, sqlOp.eq(schema.works.id, schema.reading_logs.work_id))
      .where(sqlOp.eq(schema.reading_logs.user_id, visibilityUser.id))

    expect(stored).toHaveLength(2)
    expect(stored.find((row) => row.title === privateTitle)?.visibility).toBe('privado')
    expect(stored.find((row) => row.title === unmarkedTitle)?.visibility).toBe('publico')

    const invalidWorks = await db
      .select({ id: schema.works.id })
      .from(schema.works)
      .where(sqlOp.eq(schema.works.title, invalidTitle))
    expect(invalidWorks).toHaveLength(0)

    const exported = await transferService.exportUserLibrary(visibilityUser.id)
    expect(exported.find((b) => b.title === privateTitle)?.visibility).toBe('privado')
    expect(exported.find((b) => b.title === unmarkedTitle)?.visibility).toBe('publico')
    expect(livroJsonSchema.array().safeParse(exported).success).toBe(true)
  })
})
