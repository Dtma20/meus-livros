import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { livroJsonSchema, type LivroJson } from '../../shared/schemas/export-import'
import { removeFixtures } from './fixtures'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)
const MARKER = `zz-transfer-${Date.now()}`

// EAN-13 check digit for a 12-digit prefix, so the generated ISBN passes normalizeIsbn.
function isbn13WithCheckDigit(first12: string): string {
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3)
  return first12 + String((10 - (sum % 10)) % 10)
}

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

  async function createImportUser(label: string): Promise<string> {
    const [row] = await db
      .insert(schema.users)
      .values({
        email: `${MARKER}-${label}@example.com`,
        handle: `${label.replace(/[^a-z0-9]/g, '')}${Math.random().toString(36).slice(2, 8)}`.slice(0, 20),
        display_name: `Usuário ${label}`,
        profile_visibility: 'publico',
      })
      .returning({ id: schema.users.id })
    if (!row) throw new Error(`Falha ao criar usuário ${label}.`)
    return row.id
  }

  it('does not attach a reading to another work\'s edition when the ISBN already belongs to that work', async () => {
    const isbn = isbn13WithCheckDigit(`978${String(Date.now()).slice(-9)}`)
    const [workB] = await db
      .insert(schema.works)
      .values({ title: `${MARKER} Obra B`, slug: `${MARKER}-obra-b`, created_by: testUserId })
      .returning({ id: schema.works.id })
    if (!workB) throw new Error('Falha ao criar a obra B.')
    await db.insert(schema.editions).values({ work_id: workB.id, isbn13: isbn })

    const title = `${MARKER} Mesmo ISBN Outro Titulo`
    const result = await transferService.importUserLibrary(testUserId, [
      { title, author: 'Autor ISBN Alheio', isbn, genre: [] },
    ])

    expect(result.importedCount).toBe(1)
    expect(result.errors).toEqual([
      `Livro #1 ("${title}"): ISBN já pertence a outra obra; leitura importada sem edição.`,
    ])

    const [row] = await db
      .select({ work_id: schema.reading_logs.work_id, edition_id: schema.reading_logs.edition_id })
      .from(schema.reading_logs)
      .innerJoin(schema.works, sqlOp.eq(schema.works.id, schema.reading_logs.work_id))
      .where(sqlOp.and(sqlOp.eq(schema.reading_logs.user_id, testUserId), sqlOp.eq(schema.works.title, title)))
    expect(row?.work_id).not.toBe(workB.id)
    expect(row?.edition_id).toBeNull()

    const editionsWithIsbn = await db
      .select({ id: schema.editions.id })
      .from(schema.editions)
      .where(sqlOp.eq(schema.editions.isbn13, isbn))
    expect(editionsWithIsbn).toHaveLength(1)
  })

  it('refuses only the items whose read_in is not a real past date and imports the rest', async () => {
    const userId = await createImportUser('datas')
    const good = `${MARKER} Data Valida`
    const badText = `${MARKER} Data Em Texto`
    const badFuture = `${MARKER} Ano Futuro`
    const goodYear = `${MARKER} Ano Valido`

    const result = await transferService.importUserLibrary(userId, [
      { title: good, author: 'Autor Datas', read_in: '2024-03-15', genre: [] },
      { title: badText, author: 'Autor Datas', read_in: '15/03/2024', genre: [] },
      { title: badFuture, author: 'Autor Datas', read_in: 2030, genre: [] },
      { title: goodYear, author: 'Autor Datas', read_in: 2024, genre: [] },
    ])

    expect(result.importedCount).toBe(2)
    expect(result.skippedCount).toBe(2)
    expect(result.errors).toEqual([
      `${transferService.formatImportError(2, badText)} Motivo: data de leitura "15/03/2024" fora do padrão: use AAAA, AAAA-MM ou AAAA-MM-DD.`,
      `${transferService.formatImportError(3, badFuture)} Motivo: data de leitura "2030" está no futuro.`,
    ])

    const stored = await db
      .select({ title: schema.works.title, finished_on: schema.reading_logs.finished_on, precision: schema.reading_logs.finished_precision })
      .from(schema.reading_logs)
      .innerJoin(schema.works, sqlOp.eq(schema.works.id, schema.reading_logs.work_id))
      .where(sqlOp.eq(schema.reading_logs.user_id, userId))
    expect(stored).toHaveLength(2)
    expect(stored.find((row) => row.title === good)).toMatchObject({ finished_on: '2024-03-15', precision: 'dia' })
    expect(stored.find((row) => row.title === goodYear)).toMatchObject({ finished_on: '2024-01-01', precision: 'ano' })

    const refusedWorks = await db
      .select({ id: schema.works.id })
      .from(schema.works)
      .where(sqlOp.inArray(schema.works.title, [badText, badFuture]))
    expect(refusedWorks).toHaveLength(0)
  })

  it('round-trips started_on and month precision through export and import', async () => {
    const firstUserId = await createImportUser('mes-origem')
    const monthTitle = `${MARKER} Mes Preciso`
    const sameMonthTitle = `${MARKER} Mes Mesmo Inicio`

    const result = await transferService.importUserLibrary(firstUserId, [
      { title: monthTitle, author: 'Autor Mes', started_on: '2024-03-05', read_in: '2024-04', finished_precision: 'mes', genre: [] },
      { title: sameMonthTitle, author: 'Autor Mes', started_on: '2024-04-10', read_in: '2024-04', finished_precision: 'mes', genre: [] },
    ])
    expect(result.errors).toEqual([])

    const exported = await transferService.exportUserLibrary(firstUserId)
    const exportedMonth = exported.find((b) => b.title === monthTitle)
    expect(exportedMonth).toMatchObject({ started_on: '2024-03-05', read_in: '2024-04', finished_precision: 'mes' })
    expect(exported.find((b) => b.title === sameMonthTitle)).toMatchObject({ started_on: '2024-04-10', read_in: '2024-04' })

    const secondUserId = await createImportUser('mes-destino')
    const reimport = await transferService.importUserLibrary(secondUserId, exported)
    expect(reimport.errors).toEqual([])
    expect(reimport.importedCount).toBe(2)

    const stored = await db
      .select({ title: schema.works.title, started_on: schema.reading_logs.started_on, finished_on: schema.reading_logs.finished_on, precision: schema.reading_logs.finished_precision })
      .from(schema.reading_logs)
      .innerJoin(schema.works, sqlOp.eq(schema.works.id, schema.reading_logs.work_id))
      .where(sqlOp.eq(schema.reading_logs.user_id, secondUserId))
    expect(stored.find((row) => row.title === monthTitle)).toMatchObject({
      started_on: '2024-03-05',
      finished_on: '2024-04-01',
      precision: 'mes',
    })
    expect(stored.find((row) => row.title === sameMonthTitle)).toMatchObject({
      started_on: '2024-04-10',
      finished_on: '2024-04-10',
      precision: 'mes',
    })
  })

  it('reports a genre missing from the catalogue as a per-item warning', async () => {
    const userId = await createImportUser('generos')
    const title = `${MARKER} Genero Sem Catalogo`

    const result = await transferService.importUserLibrary(userId, [
      { title, author: 'Autor Generos', genre: ['Sociologia', 'Romance'] },
    ])

    expect(result.importedCount).toBe(1)
    expect(result.errors).toEqual([
      `Livro #1 ("${title}"): gênero "Sociologia" não existe no catálogo; ignorado.`,
    ])
  })

  it('maps every GENRE_SLUG_MAP value to a genre that exists in the catalogue', async () => {
    const rows = await db.select({ slug: schema.genres.slug }).from(schema.genres)
    const slugs = new Set(rows.map((row) => row.slug))
    const missing = Object.entries(transferService.GENRE_SLUG_MAP).filter(([, slug]) => !slugs.has(slug))
    expect(missing).toEqual([])
  })
})

describe('read_in, started_on and precision rules', () => {
  let parse: typeof import('../../server/services/library-transfer')
  // 2026-10-10 12:00 UTC is 09:00 in São Paulo.
  const NOW = new Date('2026-10-10T12:00:00Z')

  beforeAll(async () => {
    parse = await import('../../server/services/library-transfer')
  })

  it('accepts a 4-digit year, YYYY-MM and YYYY-MM-DD, each with its own precision', () => {
    expect(parse.parseReadIn(2024, NOW)).toEqual({ ok: true, finishedOn: '2024-01-01', finishedPrecision: 'ano' })
    expect(parse.parseReadIn('2024', NOW)).toEqual({ ok: true, finishedOn: '2024-01-01', finishedPrecision: 'ano' })
    expect(parse.parseReadIn('2024-04', NOW)).toEqual({ ok: true, finishedOn: '2024-04-01', finishedPrecision: 'mes' })
    expect(parse.parseReadIn('2024-03-15', NOW)).toEqual({ ok: true, finishedOn: '2024-03-15', finishedPrecision: 'dia' })
  })

  it('refuses text dates, impossible calendar dates and future dates', () => {
    for (const bad of ['15/03/2024', '2024-02-30', '2024-13', '2030', '2026-11', '2026-10-11']) {
      expect(parse.parseReadIn(bad, NOW).ok, bad).toBe(false)
    }
    expect(parse.parseReadIn(2030, NOW).ok).toBe(false)
  })

  it('decides "today" in São Paulo time, not UTC', () => {
    const lateUtc = new Date('2026-10-10T02:00:00Z') // 2026-10-09 23:00 in São Paulo
    expect(parse.parseReadIn('2026-10-10', lateUtc).ok).toBe(false)
    expect(parse.parseReadIn('2026-10-09', lateUtc).ok).toBe(true)
  })

  it('keeps the legacy negative year exactly as before', () => {
    expect(parse.parseReadIn(-500, NOW)).toEqual({ ok: true, finishedOn: '-500-01-01', finishedPrecision: 'ano' })
  })

  it('treats an absent read_in as no finish date', () => {
    expect(parse.parseReadIn(undefined, NOW)).toEqual({ ok: true, finishedOn: null, finishedPrecision: 'ano' })
    expect(parse.parseReadIn('  ', NOW)).toEqual({ ok: true, finishedOn: null, finishedPrecision: 'ano' })
  })

  it('refuses a finish precision that disagrees with read_in', () => {
    const result = parse.parseReadingDates(
      { title: 'T', author: 'A', genre: [], read_in: '2024-04', finished_precision: 'dia' },
      NOW,
    )
    expect(result).toEqual({ ok: false, reason: 'precisão de término "dia" não confere com a data de leitura.' })
  })

  it('keeps a start inside the same month or year and refuses one outside it', () => {
    expect(parse.parseReadingDates(
      { title: 'T', author: 'A', genre: [], started_on: '2024-04-10', read_in: '2024-04', finished_precision: 'mes' },
      NOW,
    )).toEqual({ ok: true, startedOn: '2024-04-10', finishedOn: '2024-04-10', finishedPrecision: 'mes' })

    expect(parse.parseReadingDates(
      { title: 'T', author: 'A', genre: [], started_on: '2024-05-02', read_in: '2024-04', finished_precision: 'mes' },
      NOW,
    ).ok).toBe(false)

    expect(parse.parseReadingDates(
      { title: 'T', author: 'A', genre: [], started_on: '2024-04-25', read_in: '2024-04-20' },
      NOW,
    ).ok).toBe(false)
  })

  it('refuses a started_on that is not a real date or lies in the future', () => {
    expect(parse.parseReadingDates({ title: 'T', author: 'A', genre: [], started_on: '10/04/2024' }, NOW).ok).toBe(false)
    expect(parse.parseReadingDates({ title: 'T', author: 'A', genre: [], started_on: '2026-10-11' }, NOW).ok).toBe(false)
  })
})
