import { and, eq, sql } from 'drizzle-orm'
import { createError } from 'h3'
import type {
  LogEditionView,
  LogInput,
  LogWithDetails,
  UpdateLogInput,
} from '../../shared/schemas/log'
import { db } from '../db'
import { authors, editions, reading_logs, users, work_authors, works } from '../db/schema'
import { checkRateLimit } from './rate-limit'
import { visibleLogs, type Viewer } from './visibility'

/**
 * The response contract lives in `shared/` — a page must be able to type the
 * result of `GET /api/logs/:id` without importing anything under `server/`.
 */
export type {
  LogAuthorView as LogAuthor,
  LogEditionView as LogEdition,
  LogUserView as LogUser,
  LogWithDetails,
  LogWorkView as LogWork,
} from '../../shared/schemas/log'

export interface CreateLogOptions {
  skipRateLimit?: boolean
}

/**
 * Creates a new reading log entry.
 *
 * Rules:
 * - Rate limit: 60 logs/user/hour.
 * - Work must exist in catalogue.
 * - If edition_id is given, it must belong to work_id.
 * - No uniqueness check: re-reading the same work is fully supported.
 * - Review is plain text: stored literally.
 */
export async function createLog(
  input: LogInput,
  userId: string,
  options: CreateLogOptions = {},
): Promise<{ id: string }> {
  if (!options.skipRateLimit) {
    const underLimit = await checkRateLimit(`logs:user:${userId}`, 60)
    if (!underLimit) {
      throw createError({
        statusCode: 429,
        data: {
          error: 'muitas_tentativas',
          message: 'Muitas tentativas. Você pode registrar até 60 livros por hora.',
        },
      })
    }
  }

  // 1. Verify work exists
  const [work] = await db
    .select({ id: works.id })
    .from(works)
    .where(eq(works.id, input.work_id))
    .limit(1)

  if (!work) {
    throw createError({
      statusCode: 404,
      data: {
        error: 'nao_encontrado',
        message: 'Obra não encontrada.',
      },
    })
  }

  // 2. Verify edition belongs to work if specified
  if (input.edition_id) {
    const [edition] = await db
      .select({ id: editions.id, work_id: editions.work_id })
      .from(editions)
      .where(eq(editions.id, input.edition_id))
      .limit(1)

    if (!edition || edition.work_id !== input.work_id) {
      throw createError({
        statusCode: 400,
        data: {
          error: 'requisicao_invalida',
          message: 'A edição informada não pertence a esta obra.',
        },
      })
    }
  }

  // 3. Insert reading log
  const [created] = await db
    .insert(reading_logs)
    .values({
      user_id: userId,
      work_id: input.work_id,
      edition_id: input.edition_id ?? null,
      rating: input.rating !== undefined && input.rating !== null ? String(input.rating) : null,
      review: input.review && input.review.trim() !== '' ? input.review : null,
      started_on: input.started_on ?? null,
      finished_on: input.finished_on ?? null,
      finished_precision: input.finished_precision ?? 'dia',
      format: input.format ?? null,
      visibility: input.visibility ?? 'publico',
    })
    .returning({ id: reading_logs.id })

  if (!created) {
    throw createError({
      statusCode: 500,
      data: {
        error: 'erro_interno',
        message: 'Não foi possível registrar o livro.',
      },
    })
  }

  return { id: created.id }
}

/**
 * Retrieves a single reading log by its UUID, enforcing visibility.
 *
 * Rules:
 * - A private entry returns 404 (never 403) to other users or anonymous viewers.
 * - An entry from a private profile returns 404 to other users or anonymous viewers.
 */
export async function getLogById(id: string, viewer: Viewer): Promise<LogWithDetails> {
  const rows = await db
    .select({
      id: reading_logs.id,
      user_id: reading_logs.user_id,
      work_id: reading_logs.work_id,
      edition_id: reading_logs.edition_id,
      rating: reading_logs.rating,
      review: reading_logs.review,
      started_on: reading_logs.started_on,
      finished_on: reading_logs.finished_on,
      finished_precision: reading_logs.finished_precision,
      format: reading_logs.format,
      visibility: reading_logs.visibility,
      created_at: reading_logs.created_at,
      updated_at: reading_logs.updated_at,
      user: {
        id: users.id,
        handle: users.handle,
        display_name: users.display_name,
        profile_visibility: users.profile_visibility,
      },
      work: {
        id: works.id,
        title: works.title,
        slug: works.slug,
        first_published_year: works.first_published_year,
        cover_url: sql<string | null>`(
          -- ORDER BY is what makes this deterministic. LIMIT 1 without it
          -- returns whatever row the plan yields first, so SSR and a client
          -- refetch can disagree on which cover this work has -- including the
          -- Open Graph image, which is read once by a crawler that never
          -- revisits.
          SELECT e.cover_url FROM editions e
          WHERE e.work_id = works.id AND e.cover_url IS NOT NULL
          ORDER BY e.created_at, e.id LIMIT 1
        )`,
      },
      edition: {
        id: editions.id,
        isbn13: editions.isbn13,
        publisher: editions.publisher,
        cover_url: editions.cover_url,
        ol_cover_id: editions.ol_cover_id,
        page_count: editions.page_count,
        published_year: editions.published_year,
      },
    })
    .from(reading_logs)
    .innerJoin(users, eq(users.id, reading_logs.user_id))
    .innerJoin(works, eq(works.id, reading_logs.work_id))
    .leftJoin(editions, eq(editions.id, reading_logs.edition_id))
    .where(and(eq(reading_logs.id, id), visibleLogs(viewer)))
    .limit(1)

  const row = rows[0]
  if (!row) {
    throw createError({
      statusCode: 404,
      data: {
        error: 'nao_encontrado',
        message: 'Entrada não encontrada.',
      },
    })
  }

  // Fetch work authors in order
  const authorsList = await db
    .select({
      id: authors.id,
      name: authors.name,
      slug: authors.slug,
    })
    .from(work_authors)
    .innerJoin(authors, eq(authors.id, work_authors.author_id))
    .where(eq(work_authors.work_id, row.work.id))
    .orderBy(work_authors.position)

  return {
    id: row.id,
    user_id: row.user_id,
    work_id: row.work_id,
    edition_id: row.edition_id,
    rating: row.rating !== null ? Number(row.rating) : null,
    review: row.review,
    started_on: row.started_on,
    finished_on: row.finished_on,
    finished_precision: row.finished_precision,
    format: row.format,
    visibility: row.visibility,
    created_at: row.created_at,
    updated_at: row.updated_at,
    user: row.user,
    work: {
      ...row.work,
      authors: authorsList,
    },
    edition: row.edition_id ? row.edition : null,
  }
}

/**
 * Updates an existing reading log entry.
 *
 * Rules:
 * - Ownership is enforced in the WHERE clause.
 * - Non-owner receives 404, never 403.
 * - If edition_id is updated, it must belong to the log's work_id.
 */
export async function updateLog(
  id: string,
  input: UpdateLogInput,
  userId: string,
): Promise<{ id: string }> {
  // Query ownership in the WHERE clause
  const [existing] = await db
    .select({
      id: reading_logs.id,
      work_id: reading_logs.work_id,
      started_on: reading_logs.started_on,
      finished_on: reading_logs.finished_on,
    })
    .from(reading_logs)
    .where(and(eq(reading_logs.id, id), eq(reading_logs.user_id, userId)))
    .limit(1)

  if (!existing) {
    throw createError({
      statusCode: 404,
      data: {
        error: 'nao_encontrado',
        message: 'Entrada não encontrada.',
      },
    })
  }

  // If edition_id is provided, verify it belongs to this work
  if (input.edition_id) {
    const [edition] = await db
      .select({ id: editions.id, work_id: editions.work_id })
      .from(editions)
      .where(eq(editions.id, input.edition_id))
      .limit(1)

    if (!edition || edition.work_id !== existing.work_id) {
      throw createError({
        statusCode: 400,
        data: {
          error: 'requisicao_invalida',
          message: 'A edição informada não pertence a esta obra.',
        },
      })
    }
  }

  // Validate dates ordering if either or both are being updated
  const finalStarted = input.started_on !== undefined ? input.started_on : existing.started_on
  const finalFinished = input.finished_on !== undefined ? input.finished_on : existing.finished_on
  if (finalStarted && finalFinished && finalStarted > finalFinished) {
    throw createError({
      statusCode: 400,
      data: {
        error: 'requisicao_invalida',
        message: 'A data de início deve ser anterior ou igual à data de término.',
      },
    })
  }

  const updateData: Partial<typeof reading_logs.$inferInsert> = {
    updated_at: new Date(),
  }

  if (input.edition_id !== undefined) {
    updateData.edition_id = input.edition_id ?? null
  }
  if (input.rating !== undefined) {
    updateData.rating = input.rating !== null ? String(input.rating) : null
  }
  if (input.review !== undefined) {
    updateData.review = input.review && input.review.trim() !== '' ? input.review : null
  }
  if (input.started_on !== undefined) {
    updateData.started_on = input.started_on ?? null
  }
  if (input.finished_on !== undefined) {
    updateData.finished_on = input.finished_on ?? null
  }
  if (input.finished_precision !== undefined) {
    updateData.finished_precision = input.finished_precision
  }
  if (input.format !== undefined) {
    updateData.format = input.format ?? null
  }
  if (input.visibility !== undefined) {
    updateData.visibility = input.visibility
  }

  const [updated] = await db
    .update(reading_logs)
    .set(updateData)
    .where(and(eq(reading_logs.id, id), eq(reading_logs.user_id, userId)))
    .returning({ id: reading_logs.id })

  if (!updated) {
    throw createError({
      statusCode: 404,
      data: {
        error: 'nao_encontrado',
        message: 'Entrada não encontrada.',
      },
    })
  }

  return { id: updated.id }
}

/**
 * Deletes a reading log entry.
 *
 * Rules:
 * - Ownership is enforced in the WHERE clause.
 * - Non-owner receives 404, never 403.
 */
export async function deleteLog(id: string, userId: string): Promise<void> {
  const deleted = await db
    .delete(reading_logs)
    .where(and(eq(reading_logs.id, id), eq(reading_logs.user_id, userId)))
    .returning({ id: reading_logs.id })

  if (deleted.length === 0) {
    throw createError({
      statusCode: 404,
      data: {
        error: 'nao_encontrado',
        message: 'Entrada não encontrada.',
      },
    })
  }
}

/**
 * Fetches available editions for a given work.
 */
export async function getEditionsForWork(workId: string): Promise<LogEditionView[]> {
  return db
    .select({
      id: editions.id,
      isbn13: editions.isbn13,
      publisher: editions.publisher,
      cover_url: editions.cover_url,
      ol_cover_id: editions.ol_cover_id,
      page_count: editions.page_count,
      published_year: editions.published_year,
    })
    .from(editions)
    .where(eq(editions.work_id, workId))
    .orderBy(editions.published_year, editions.created_at)
}
