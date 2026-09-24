import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { removeFixtures } from './fixtures'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)

/** Every row this file creates carries this marker so cleanup can find it. */
const MARKER = `zz-teste-edicao-${Date.now()}`

interface H3ErrorLike {
  statusCode?: number
  data?: { error?: string, message?: string }
}

function asError(caught: unknown): H3ErrorLike {
  return caught as H3ErrorLike
}

describe.skipIf(!hasDatabaseUrl)('Work and edition editing', () => {
  let db: typeof import('../../server/db')['db']
  let client: typeof import('../../server/db')['client']
  let schema: typeof import('../../server/db/schema')
  let catalog: typeof import('../../server/services/catalog')
  let sqlOp: typeof import('drizzle-orm')
  let ownerId: string
  let otherId: string

  beforeAll(async () => {
    const dbModule = await import('../../server/db')
    db = dbModule.db
    client = dbModule.client
    schema = await import('../../server/db/schema')
    catalog = await import('../../server/services/catalog')
    sqlOp = await import('drizzle-orm')

    const created = await db
      .insert(schema.users)
      .values([
        {
          email: `${MARKER}-dono@example.com`,
          handle: `td${Date.now()}`.slice(0, 20),
          display_name: 'Dono de teste',
        },
        {
          email: `${MARKER}-outro@example.com`,
          handle: `to${Date.now()}`.slice(0, 20),
          display_name: 'Outro de teste',
        },
      ])
      .returning({ id: schema.users.id })

    if (created.length !== 2 || !created[0] || !created[1]) {
      throw new Error('Não foi possível criar os usuários de teste.')
    }
    ownerId = created[0].id
    otherId = created[1].id
  })

  afterAll(async () => {
    // One pass for both users. The old per-user loop deleted the owner before
    // the works the other user had edited were gone, and a log left by a
    // failed test below made the works delete throw and skip the rest.
    try {
      await removeFixtures(MARKER)
    } finally {
      await client?.end()
    }
  })

  async function makeWork(suffix: string) {
    return catalog.createWork(
      {
        title: `${MARKER} ${suffix}`,
        authors: [{ name: `${MARKER} Autor ${suffix}` }],
        first_published_year: 1899,
        series_name: 'Série Original',
        series_number: '1',
        genre_ids: [],
        edition: { publisher: 'Editora Original', page_count: 200 },
      },
      ownerId,
      { skipRateLimit: true },
    )
  }

  it('updates only the fields that were sent', async () => {
    const work = await makeWork('parcial')

    await catalog.updateWork(work.id, { title: `${MARKER} Título Corrigido` }, ownerId)

    const [row] = await db
      .select({
        title: schema.works.title,
        series_name: schema.works.series_name,
        series_number: schema.works.series_number,
        year: schema.works.first_published_year,
      })
      .from(schema.works)
      .where(sqlOp.eq(schema.works.id, work.id))

    expect(row?.title).toBe(`${MARKER} Título Corrigido`)
    // Untouched by a body that never mentioned them.
    expect(row?.series_name).toBe('Série Original')
    expect(row?.series_number).toBe('1')
    expect(row?.year).toBe(1899)
  })

  it('clears a field when null is sent explicitly', async () => {
    const work = await makeWork('limpar')

    await catalog.updateWork(work.id, { series_name: null, series_number: null }, ownerId)

    const [row] = await db
      .select({
        series_name: schema.works.series_name,
        series_number: schema.works.series_number,
        year: schema.works.first_published_year,
      })
      .from(schema.works)
      .where(sqlOp.eq(schema.works.id, work.id))

    expect(row?.series_name).toBeNull()
    expect(row?.series_number).toBeNull()
    expect(row?.year).toBe(1899)
  })

  it('keeps the slug when the title changes, so shared links survive', async () => {
    const work = await makeWork('permalink')
    const slugBefore = work.slug

    const result = await catalog.updateWork(
      work.id,
      { title: `${MARKER} Um Título Completamente Diferente` },
      ownerId,
    )

    const [row] = await db
      .select({ slug: schema.works.slug })
      .from(schema.works)
      .where(sqlOp.eq(schema.works.id, work.id))

    expect(row?.slug).toBe(slugBefore)
    expect(result.slug).toBe(slugBefore)
  })

  it('records who edited last', async () => {
    const work = await makeWork('auditoria')

    // A member who did not create the work may still correct it.
    await catalog.updateWork(work.id, { title: `${MARKER} Corrigido por outro` }, otherId)

    const [row] = await db
      .select({ updated_by: schema.works.updated_by, updated_at: schema.works.updated_at })
      .from(schema.works)
      .where(sqlOp.eq(schema.works.id, work.id))

    expect(row?.updated_by).toBe(otherId)
    expect(row?.updated_at).toBeInstanceOf(Date)
  })

  it('replaces authors and preserves their order', async () => {
    const work = await makeWork('autores')

    await catalog.updateWork(
      work.id,
      {
        authors: [
          { name: `${MARKER} Segundo Autor` },
          { name: `${MARKER} Primeiro Autor` },
        ],
      },
      ownerId,
    )

    const rows = await db
      .select({ name: schema.authors.name, position: schema.work_authors.position })
      .from(schema.work_authors)
      .innerJoin(schema.authors, sqlOp.eq(schema.authors.id, schema.work_authors.author_id))
      .where(sqlOp.eq(schema.work_authors.work_id, work.id))
      .orderBy(schema.work_authors.position)

    expect(rows.map((r) => r.name)).toEqual([
      `${MARKER} Segundo Autor`,
      `${MARKER} Primeiro Autor`,
    ])
    expect(rows.map((r) => r.position)).toEqual([0, 1])
  })

  it('backfills a country onto an author who had none', async () => {
    const work = await makeWork('pais')

    const [before] = await db
      .select({ code: schema.authors.country_code })
      .from(schema.authors)
      .where(sqlOp.eq(schema.authors.name, `${MARKER} Autor pais`))
    expect(before?.code).toBeNull()

    await catalog.updateWork(
      work.id,
      { authors: [{ name: `${MARKER} Autor pais`, country_code: 'BR', country_label: 'Brasil' }] },
      ownerId,
    )

    const [after] = await db
      .select({ code: schema.authors.country_code, label: schema.authors.country_label })
      .from(schema.authors)
      .where(sqlOp.eq(schema.authors.name, `${MARKER} Autor pais`))

    expect(after?.code).toBe('BR')
    expect(after?.label).toBe('Brasil')
  })

  it('does not overwrite a country an author already has', async () => {
    const work = await makeWork('pais-existente')

    await catalog.updateWork(
      work.id,
      {
        authors: [
          { name: `${MARKER} Autor pais-existente`, country_code: 'BR', country_label: 'Brasil' },
        ],
      },
      ownerId,
    )

    // A second member edits another of their books and types something else.
    await catalog.updateWork(
      work.id,
      {
        authors: [
          { name: `${MARKER} Autor pais-existente`, country_code: 'PT', country_label: 'Portugal' },
        ],
      },
      otherId,
    )

    const [row] = await db
      .select({ code: schema.authors.country_code })
      .from(schema.authors)
      .where(sqlOp.eq(schema.authors.name, `${MARKER} Autor pais-existente`))

    expect(row?.code).toBe('BR')
  })

  it('rejects a genre id that does not exist', async () => {
    const work = await makeWork('genero-invalido')

    try {
      // Within smallint range, so this reaches the service's own existence
      // check rather than overflowing the column. Out-of-range ids are the
      // schema's job and are covered in tests/unit/work-update.test.ts.
      await catalog.updateWork(work.id, { genre_ids: [9999] }, ownerId)
      expect.unreachable('updateWork deveria ter recusado o gênero.')
    } catch (caught) {
      expect(asError(caught).statusCode).toBe(400)
    }
  })

  it('normalises an ISBN on update and clears it when null is sent', async () => {
    const work = await makeWork('isbn')
    const [edition] = await db
      .select({ id: schema.editions.id })
      .from(schema.editions)
      .where(sqlOp.eq(schema.editions.work_id, work.id))
    if (!edition) throw new Error('A edição de teste não foi criada.')

    // Hyphenated ISBN-10; normalises to its ISBN-13 form, separators and all.
    await catalog.updateEdition(edition.id, { isbn: '85-359-1484-6' }, ownerId)

    const [withIsbn] = await db
      .select({ isbn13: schema.editions.isbn13 })
      .from(schema.editions)
      .where(sqlOp.eq(schema.editions.id, edition.id))
    expect(withIsbn?.isbn13).toBe('9788535914849')

    await catalog.updateEdition(edition.id, { isbn: null }, ownerId)

    const [cleared] = await db
      .select({ isbn13: schema.editions.isbn13, publisher: schema.editions.publisher })
      .from(schema.editions)
      .where(sqlOp.eq(schema.editions.id, edition.id))

    expect(cleared?.isbn13).toBeNull()
    // Untouched by a body that only mentioned the ISBN.
    expect(cleared?.publisher).toBe('Editora Original')
  })

  it('answers 409 rather than 500 when an ISBN is already taken', async () => {
    const first = await makeWork('isbn-a')
    const second = await makeWork('isbn-b')

    const [editionA] = await db
      .select({ id: schema.editions.id })
      .from(schema.editions)
      .where(sqlOp.eq(schema.editions.work_id, first.id))
    const [editionB] = await db
      .select({ id: schema.editions.id })
      .from(schema.editions)
      .where(sqlOp.eq(schema.editions.work_id, second.id))
    if (!editionA || !editionB) throw new Error('As edições de teste não foram criadas.')

    // A different ISBN from the normalisation test above, so the two do not
    // depend on execution order to avoid colliding with each other.
    await catalog.updateEdition(editionA.id, { isbn: '9788535914856' }, ownerId)

    try {
      await catalog.updateEdition(editionB.id, { isbn: '9788535914856' }, ownerId)
      expect.unreachable('updateEdition deveria ter recusado o ISBN duplicado.')
    } catch (caught) {
      expect(asError(caught).statusCode).toBe(409)
      expect(asError(caught).data?.error).toBe('conflito')
    }
  })

  it('deletes an edition and leaves the reading log standing', async () => {
    const work = await makeWork('excluir-edicao')
    const [edition] = await db
      .select({ id: schema.editions.id })
      .from(schema.editions)
      .where(sqlOp.eq(schema.editions.work_id, work.id))
    if (!edition) throw new Error('A edição de teste não foi criada.')

    const [log] = await db
      .insert(schema.reading_logs)
      .values({
        user_id: ownerId,
        work_id: work.id,
        edition_id: edition.id,
        rating: '4.0',
      })
      .returning({ id: schema.reading_logs.id })
    if (!log) throw new Error('O registro de leitura de teste não foi criado.')

    await catalog.deleteEdition(edition.id, ownerId)

    const [survivor] = await db
      .select({ id: schema.reading_logs.id, edition_id: schema.reading_logs.edition_id })
      .from(schema.reading_logs)
      .where(sqlOp.eq(schema.reading_logs.id, log.id))

    // The log survives with its rating; it only stops naming an edition.
    expect(survivor?.id).toBe(log.id)
    expect(survivor?.edition_id).toBeNull()
  })
})
