import { and, eq, gt, inArray, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { db } from '../db'
import { authors, editions, genres, reading_logs, work_authors, work_genres, works } from '../db/schema'
import { normalizeIsbn } from '../utils/isbn'
import { logger } from '../utils/logger'
import { slugify, uniqueSlug } from '../utils/slug'
import { hasField } from '../../shared/schemas/work'
import type {
  EditionInput,
  EditionUpdateInput,
  WorkInput,
  WorkUpdateInput,
} from '../../shared/schemas/work'

/**
 * The catalogue is shared property: anyone with a session may add to it and
 * anyone with a session may correct it. No row here carries visibility.
 *
 * Editing is deliberately not restricted to whoever created the row. A work is
 * shared by everyone who logged it, so "only the creator may fix the title"
 * means the typo is permanent for everybody the moment that member stops using
 * the site — and a mistyped work cannot be deleted either, because `deleteWork`
 * refuses once any reading log points at it. `updated_by` is the trade: an
 * invite-only cohort of about thirty people who know each other offline does
 * not need approval flows, it needs a name next to the change.
 */

/** Works a single user may create per hour. */
const WORKS_PER_HOUR = 30

function conflict(message: string, extra: Record<string, unknown> = {}) {
  return createError({
    statusCode: 409,
    data: { error: 'conflito', message, ...extra },
  })
}

function badRequest(message: string) {
  return createError({
    statusCode: 400,
    data: { error: 'requisicao_invalida', message },
  })
}

/**
 * Postgres unique-violation. A repeated ISBN is a conflict, never a 500.
 *
 * Drizzle wraps the driver error, so the SQLSTATE lives on `cause`, not on the
 * error itself. Checking only the top level silently misses every violation.
 */
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown, cause?: { code?: unknown } } | null)?.code
    ?? (error as { cause?: { code?: unknown } } | null)?.cause?.code
  return code === '23505'
}

export type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

async function assertUnderRateLimit(userId: string, conn: DbOrTx = db): Promise<void> {
  const [row] = await conn
    .select({ n: sql<number>`count(*)::int` })
    .from(works)
    .where(and(eq(works.created_by, userId), gt(works.created_at, sql`now() - interval '1 hour'`)))

  if ((row?.n ?? 0) >= WORKS_PER_HOUR) {
    throw createError({
      statusCode: 429,
      data: {
        error: 'limite_excedido',
        message: `Você pode cadastrar até ${WORKS_PER_HOUR} obras por hora. Tente novamente mais tarde.`,
      },
    })
  }
}

/** Match an author by slug, or create one. Returns the author id. */
export async function findOrCreateAuthor(
  name: string,
  userId: string,
  country?: { code?: string | null, label?: string | null },
  conn: DbOrTx = db,
): Promise<string> {
  const slug = slugify(name)
  if (!slug) throw badRequest('Nome de autor inválido.')

  const [existing] = await conn.select({ id: authors.id }).from(authors).where(eq(authors.slug, slug))
  if (existing) return existing.id

  const [created] = await conn
    .insert(authors)
    .values({
      name,
      slug,
      country_code: country?.code ?? null,
      country_label: country?.label ?? null,
      created_by: userId,
    })
    .onConflictDoNothing()
    .returning({ id: authors.id })

  if (created) return created.id

  // Lost the race against a concurrent insert: the row exists now.
  const [raced] = await conn.select({ id: authors.id }).from(authors).where(eq(authors.slug, slug))
  if (!raced) throw new Error(`O autor "${name}" não pôde ser criado nem encontrado.`)
  return raced.id
}

/**
 * A probable duplicate: identical unaccented lowercase title AND at least one
 * author in common. Title alone is not enough — different authors write books
 * with the same name.
 */
export async function findDuplicateWork(
  title: string,
  authorSlugs: string[],
  conn: DbOrTx = db,
): Promise<{ id: string, slug: string, title: string, cover_url?: string | null } | null> {
  if (authorSlugs.length === 0) return null

  const rows = await conn
    .select({
      id: works.id,
      slug: works.slug,
      title: works.title,
      cover_url: sql<string | null>`(
        SELECT e.cover_url
        FROM editions e
        WHERE e.work_id = ${works.id} AND e.cover_url IS NOT NULL
        ORDER BY e.created_at
        LIMIT 1
      )`,
    })
    .from(works)
    .innerJoin(work_authors, eq(work_authors.work_id, works.id))
    .innerJoin(authors, eq(authors.id, work_authors.author_id))
    .where(
      and(
        sql`f_unaccent(lower(${works.title})) = f_unaccent(lower(${title}))`,
        inArray(authors.slug, authorSlugs),
      ),
    )
    .limit(1)

  return rows[0] ?? null
}

type EditionInserter = Pick<DbOrTx, 'insert'>

async function insertEdition(
  tx: EditionInserter,
  workId: string,
  input: EditionInput,
  userId: string,
): Promise<{ id: string }> {
  // Normalise before inserting: the partial unique index only means something
  // if every stored ISBN is in the same shape. Anything that is not an ISBN —
  // the corpus carries three Amazon ASINs — becomes null, which is legal and
  // repeatable by design.
  const isbn13 = normalizeIsbn(input.isbn ?? null)

  try {
    const [row] = await tx
      .insert(editions)
      .values({
        work_id: workId,
        isbn13,
        publisher: input.publisher ?? null,
        page_count: input.page_count ?? null,
        published_year: input.published_year ?? null,
        language: input.language?.toLowerCase() ?? null,
        cover_url: input.cover_url ?? null,
        ol_cover_id: input.ol_cover_id ?? null,
        created_by: userId,
      })
      .returning({ id: editions.id })

    if (!row) throw new Error('A edição não pôde ser criada.')
    return row
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict('Já existe uma edição cadastrada com este ISBN.', { isbn13 })
    }
    throw error
  }
}

export interface CreateWorkResult {
  id: string
  slug: string
  edition?: { id: string }
}

export interface CreateWorkOptions {
  force?: boolean
  /**
   * Pula a verificação de limite de taxa (WORKS_PER_HOUR).
   * Existe só para scripts de migração rodados da máquina do mantenedor,
   * NUNCA a partir de rota HTTP (server/api/).
   */
  skipRateLimit?: boolean
  /**
   * Transação ou conexão Drizzle para operações em lote dentro de uma mesma transação.
   * Existe só para scripts de migração rodados da máquina do mantenedor.
   */
  tx?: DbOrTx
}

export async function createWork(
  input: WorkInput,
  userId: string,
  options: CreateWorkOptions = {},
): Promise<CreateWorkResult> {
  const conn = options.tx ?? db

  if (!options.skipRateLimit) {
    await assertUnderRateLimit(userId, conn)
  }

  const authorSlugs = input.authors.map((a) => slugify(a.name)).filter(Boolean)

  if (!options.force) {
    const duplicate = await findDuplicateWork(input.title, authorSlugs, conn)
    if (duplicate) {
      throw conflict(
        'Já existe uma obra com este título e autor. Use ?forcar=1 para cadastrar mesmo assim.',
        { work: duplicate },
      )
    }
  }

  const genreIds = [...new Set(input.genre_ids)]
  if (genreIds.length > 0) {
    const found = await conn.select({ id: genres.id }).from(genres).where(inArray(genres.id, genreIds))
    if (found.length !== genreIds.length) {
      throw badRequest('Um ou mais gêneros informados não existem.')
    }
  }

  const authorIds: string[] = []
  for (const author of input.authors) {
    authorIds.push(
      await findOrCreateAuthor(author.name, userId, {
        code: author.country_code,
        label: author.country_label,
      }, conn),
    )
  }

  const slug = await uniqueSlug(input.title, async (candidate) => {
    const [row] = await conn.select({ id: works.id }).from(works).where(eq(works.slug, candidate))
    return Boolean(row)
  })

  return conn.transaction(async (tx) => {
    const [work] = await tx
      .insert(works)
      .values({
        slug,
        title: input.title,
        original_language: input.original_language?.toLowerCase() ?? null,
        first_published_year: input.first_published_year ?? null,
        series_name: input.series_name ?? null,
        series_number: input.series_number ?? null,
        ol_work_key: input.ol_work_key ?? null,
        created_by: userId,
      })
      .returning({ id: works.id, slug: works.slug, title: works.title })

    if (!work) throw new Error('A obra não pôde ser criada.')

    // Array order is authorship order, so position preserves it.
    if (authorIds.length > 0) {
      await tx
        .insert(work_authors)
        .values(authorIds.map((author_id, position) => ({ work_id: work.id, author_id, position })))
        .onConflictDoNothing()
    }

    if (genreIds.length > 0) {
      await tx
        .insert(work_genres)
        .values(genreIds.map((genre_id) => ({ work_id: work.id, genre_id })))
        .onConflictDoNothing()
    }

    let createdEdition: { id: string } | undefined
    if (input.edition) {
      createdEdition = await insertEdition(tx, work.id, input.edition, userId)
    }

    logger.info(`[catalog] Obra criada: ${work.title} (${work.id})`, {
      module: 'catalog',
      feature: 'book_catalog',
      operation: 'create_work',
      userId,
      context: { workId: work.id, slug: work.slug, title: work.title },
    })

    return { id: work.id, slug: work.slug, edition: createdEdition }
  })
}

export async function createEdition(
  workId: string,
  input: EditionInput,
  userId: string,
  conn: DbOrTx = db,
): Promise<{ id: string }> {
  const [work] = await conn.select({ id: works.id }).from(works).where(eq(works.id, workId))
  if (!work) {
    throw createError({
      statusCode: 404,
      data: { error: 'nao_encontrado', message: 'Obra não encontrada.' },
    })
  }

  const result = await insertEdition(conn, workId, input, userId)
  logger.info(`[catalog] Edição criada para a obra ${workId}: ${result.id}`, {
    module: 'catalog',
    feature: 'book_catalog',
    operation: 'create_edition',
    userId,
    context: { workId, editionId: result.id },
  })
  return result
}

/**
 * Deletes a work from the catalogue if created by the user and without reading logs.
 *
 * Rules:
 * - Creator check in the query: non-creator receives 404 (never 403).
 * - A work with existing reading logs cannot be deleted (returns 400).
 * - Cascades to work_authors, work_genres, and editions via DB foreign keys.
 */
export async function deleteWork(workId: string, userId: string): Promise<void> {
  const [work] = await db
    .select({ id: works.id, created_by: works.created_by })
    .from(works)
    .where(eq(works.id, workId))
    .limit(1)

  if (!work || work.created_by !== userId) {
    throw createError({
      statusCode: 404,
      data: { error: 'nao_encontrado', message: 'Obra não encontrada.' },
    })
  }

  const [logCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reading_logs)
    .where(eq(reading_logs.work_id, workId))

  if ((logCount?.n ?? 0) > 0) {
    throw createError({
      statusCode: 400,
      data: {
        error: 'requisicao_invalida',
        message: 'Não é possível excluir um livro que já possui registros de leitura.',
      },
    })
  }

  await db.delete(works).where(eq(works.id, workId))
  logger.info(`[catalog] Obra excluída: ${workId}`, {
    module: 'catalog',
    feature: 'book_catalog',
    operation: 'delete_work',
    userId,
    context: { workId },
  })
}

/**
 * Sets an author's country when it is still unknown.
 *
 * `findOrCreateAuthor` returns early on an existing row, so an author first
 * created without a country — which is every author added through the add-book
 * form, because that form has no country field — stays without one forever and
 * no amount of editing books reaches it. The reading map is built entirely from
 * `authors.country_code`, so those authors are permanently invisible on it.
 *
 * Only fills a blank. An author who already carries a country is left alone:
 * one member editing one of their books must not silently rewrite a fact every
 * other book by that author depends on. Replacing a country that is already
 * set is an author-level edit and belongs on an author-level route.
 */
async function backfillAuthorCountry(
  authorId: string,
  country: { code?: string | null, label?: string | null },
  conn: DbOrTx,
): Promise<void> {
  const code = country.code ?? null
  const label = country.label ?? null
  if (!code && !label) return

  await conn
    .update(authors)
    .set({
      ...(code ? { country_code: code } : {}),
      ...(label ? { country_label: label } : {}),
    })
    .where(
      and(
        eq(authors.id, authorId),
        // The guard is in the WHERE clause rather than in an if-statement after
        // a read: two members saving two books by the same author at the same
        // moment would both see a blank and both write.
        sql`${authors.country_code} IS NULL AND ${authors.country_label} IS NULL`,
      ),
    )
}

/**
 * Applies a partial update to a work.
 *
 * Absent keys are left untouched; an explicit `null` clears the column. See
 * `workUpdateSchema` for why that distinction is load-bearing.
 *
 * `authors` and `genre_ids` are full replacements, not merges: both are lists
 * the form renders in their entirety, so what was sent is the complete
 * intended state. Array order is authorship order, preserved as `position`.
 */
export async function updateWork(
  workId: string,
  input: WorkUpdateInput,
  userId: string,
): Promise<{ id: string, slug: string }> {
  const [work] = await db
    .select({ id: works.id, slug: works.slug, title: works.title })
    .from(works)
    .where(eq(works.id, workId))
    .limit(1)

  if (!work) {
    throw createError({
      statusCode: 404,
      data: { error: 'nao_encontrado', message: 'Obra não encontrada.' },
    })
  }

  const genreIds = hasField(input, 'genre_ids') ? [...new Set(input.genre_ids ?? [])] : null
  if (genreIds && genreIds.length > 0) {
    const found = await db
      .select({ id: genres.id })
      .from(genres)
      .where(inArray(genres.id, genreIds))
    if (found.length !== genreIds.length) {
      throw badRequest('Um ou mais gêneros informados não existem.')
    }
  }

  return db.transaction(async (tx) => {
    // `slug` is absent from this object on purpose: it is the permalink, and a
    // corrected title must not break links already pasted into WhatsApp.
    const patch: Partial<typeof works.$inferInsert> = {
      updated_by: userId,
      updated_at: new Date(),
    }
    if (hasField(input, 'title')) patch.title = input.title
    if (hasField(input, 'original_language')) {
      patch.original_language = input.original_language?.toLowerCase() ?? null
    }
    if (hasField(input, 'first_published_year')) {
      patch.first_published_year = input.first_published_year ?? null
    }
    if (hasField(input, 'series_name')) patch.series_name = input.series_name ?? null
    if (hasField(input, 'series_number')) patch.series_number = input.series_number ?? null

    await tx.update(works).set(patch).where(eq(works.id, workId))

    if (hasField(input, 'authors') && input.authors) {
      const authorIds: string[] = []
      for (const author of input.authors) {
        const authorId = await findOrCreateAuthor(
          author.name,
          userId,
          { code: author.country_code, label: author.country_label },
          tx,
        )
        await backfillAuthorCountry(
          authorId,
          { code: author.country_code, label: author.country_label },
          tx,
        )
        authorIds.push(authorId)
      }

      // Replace rather than merge. Deleting first is what lets an author be
      // removed and what lets the rest be renumbered: `position` is part of the
      // payload, not of the primary key, so an upsert would leave a dropped
      // author behind and reorderings half-applied.
      await tx.delete(work_authors).where(eq(work_authors.work_id, workId))
      if (authorIds.length > 0) {
        await tx
          .insert(work_authors)
          .values(
            authorIds.map((author_id, position) => ({ work_id: workId, author_id, position })),
          )
          .onConflictDoNothing()
      }
    }

    if (genreIds) {
      await tx.delete(work_genres).where(eq(work_genres.work_id, workId))
      if (genreIds.length > 0) {
        await tx
          .insert(work_genres)
          .values(genreIds.map((genre_id) => ({ work_id: workId, genre_id })))
          .onConflictDoNothing()
      }
    }

    logger.info(`[catalog] Obra atualizada: ${work.title} (${workId})`, {
      module: 'catalog',
      feature: 'book_catalog',
      operation: 'update_work',
      userId,
      context: { workId, slug: work.slug, fields: Object.keys(input) },
    })

    return { id: work.id, slug: work.slug }
  })
}

/**
 * Applies a partial update to an edition.
 *
 * `isbn` arrives as free text and is normalised exactly as on create, so the
 * partial unique index keeps meaning something. Clearing it — sending `null` —
 * is legal and repeatable: that index is partial precisely so that "no ISBN" is
 * not a collision.
 */
export async function updateEdition(
  editionId: string,
  input: EditionUpdateInput,
  userId: string,
): Promise<{ id: string, work_id: string }> {
  const [edition] = await db
    .select({ id: editions.id, work_id: editions.work_id })
    .from(editions)
    .where(eq(editions.id, editionId))
    .limit(1)

  if (!edition) {
    throw createError({
      statusCode: 404,
      data: { error: 'nao_encontrado', message: 'Edição não encontrada.' },
    })
  }

  const patch: Partial<typeof editions.$inferInsert> = {
    updated_by: userId,
    updated_at: new Date(),
  }
  let isbn13: string | null = null
  if (hasField(input, 'isbn')) {
    isbn13 = normalizeIsbn(input.isbn ?? null)
    patch.isbn13 = isbn13
  }
  if (hasField(input, 'publisher')) patch.publisher = input.publisher ?? null
  if (hasField(input, 'page_count')) patch.page_count = input.page_count ?? null
  if (hasField(input, 'published_year')) patch.published_year = input.published_year ?? null
  if (hasField(input, 'language')) patch.language = input.language?.toLowerCase() ?? null
  if (hasField(input, 'cover_url')) patch.cover_url = input.cover_url ?? null
  if (hasField(input, 'ol_cover_id')) patch.ol_cover_id = input.ol_cover_id ?? null

  try {
    await db.update(editions).set(patch).where(eq(editions.id, editionId))
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict('Já existe uma edição cadastrada com este ISBN.', { isbn13 })
    }
    throw error
  }

  logger.info(`[catalog] Edição atualizada: ${editionId}`, {
    module: 'catalog',
    feature: 'book_catalog',
    operation: 'update_edition',
    userId,
    context: { editionId, workId: edition.work_id, fields: Object.keys(input) },
  })

  return { id: edition.id, work_id: edition.work_id }
}

/**
 * Deletes an edition.
 *
 * Safe while reading logs point at it: `reading_logs.edition_id` is
 * `ON DELETE set null`, and a null `edition_id` is the ordinary state for most
 * logs anyway — picking an edition is optional by design. The log keeps its
 * rating, review and dates; it only stops claiming which printing was read.
 *
 * No "last edition" guard, for the same reason: a work with no editions is
 * legal, and it is what every work created without edition details already is.
 */
export async function deleteEdition(editionId: string, userId: string): Promise<void> {
  const [edition] = await db
    .select({ id: editions.id, work_id: editions.work_id })
    .from(editions)
    .where(eq(editions.id, editionId))
    .limit(1)

  if (!edition) {
    throw createError({
      statusCode: 404,
      data: { error: 'nao_encontrado', message: 'Edição não encontrada.' },
    })
  }

  await db.delete(editions).where(eq(editions.id, editionId))

  logger.info(`[catalog] Edição excluída: ${editionId}`, {
    module: 'catalog',
    feature: 'book_catalog',
    operation: 'delete_edition',
    userId,
    context: { editionId, workId: edition.work_id },
  })
}
