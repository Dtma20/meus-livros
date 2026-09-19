import { and, eq, gt, inArray, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { db } from '../db'
import { authors, editions, genres, work_authors, work_genres, works } from '../db/schema'
import { normalizeIsbn } from '../utils/isbn'
import { slugify, uniqueSlug } from '../utils/slug'
import type { EditionInput, WorkInput } from '../../shared/schemas/work'

/**
 * The catalogue is shared property: anyone with a session may add to it, no row
 * here carries visibility, and nothing here deletes.
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

async function assertUnderRateLimit(userId: string): Promise<void> {
  const [row] = await db
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
): Promise<string> {
  const slug = slugify(name)
  if (!slug) throw badRequest('Nome de autor inválido.')

  const [existing] = await db.select({ id: authors.id }).from(authors).where(eq(authors.slug, slug))
  if (existing) return existing.id

  const [created] = await db
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
  const [raced] = await db.select({ id: authors.id }).from(authors).where(eq(authors.slug, slug))
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
): Promise<{ id: string, slug: string, title: string } | null> {
  if (authorSlugs.length === 0) return null

  const rows = await db
    .select({ id: works.id, slug: works.slug, title: works.title })
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

type EditionInserter = Pick<typeof db, 'insert'>

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
}

export async function createWork(
  input: WorkInput,
  userId: string,
  options: { force?: boolean } = {},
): Promise<CreateWorkResult> {
  await assertUnderRateLimit(userId)

  const authorSlugs = input.authors.map((a) => slugify(a.name)).filter(Boolean)

  if (!options.force) {
    const duplicate = await findDuplicateWork(input.title, authorSlugs)
    if (duplicate) {
      throw conflict(
        'Já existe uma obra com este título e autor. Use ?forcar=1 para cadastrar mesmo assim.',
        { work: duplicate },
      )
    }
  }

  const genreIds = [...new Set(input.genre_ids)]
  if (genreIds.length > 0) {
    const found = await db.select({ id: genres.id }).from(genres).where(inArray(genres.id, genreIds))
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
      }),
    )
  }

  const slug = await uniqueSlug(input.title, async (candidate) => {
    const [row] = await db.select({ id: works.id }).from(works).where(eq(works.slug, candidate))
    return Boolean(row)
  })

  return db.transaction(async (tx) => {
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
      .returning({ id: works.id, slug: works.slug })

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

    if (input.edition) {
      await insertEdition(tx, work.id, input.edition, userId)
    }

    return { id: work.id, slug: work.slug }
  })
}

export async function createEdition(
  workId: string,
  input: EditionInput,
  userId: string,
): Promise<{ id: string }> {
  const [work] = await db.select({ id: works.id }).from(works).where(eq(works.id, workId))
  if (!work) {
    throw createError({
      statusCode: 404,
      data: { error: 'nao_encontrado', message: 'Obra não encontrada.' },
    })
  }

  return insertEdition(db, workId, input, userId)
}
