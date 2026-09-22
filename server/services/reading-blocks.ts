import { and, desc, eq } from 'drizzle-orm'
import { createError } from 'h3'
import type {
  ReadingBlockInput,
  ReadingBlockView,
  ReadingProgressView,
  UpdateReadingBlockInput,
} from '../../shared/schemas/reading-block'
import { calculateReadingProgress } from '../../shared/utils/reading-progress'
import { db } from '../db'
import { editions, reading_blocks, reading_logs } from '../db/schema'
import { visibleLogs, type Viewer } from './visibility'

export async function getBlocksForLog(
  logId: string,
  viewer: Viewer,
): Promise<{ blocks: ReadingBlockView[]; progress: ReadingProgressView }> {
  const [log] = await db
    .select({
      id: reading_logs.id,
      user_id: reading_logs.user_id,
      edition_id: reading_logs.edition_id,
      finished_on: reading_logs.finished_on,
      edition_page_count: editions.page_count,
    })
    .from(reading_logs)
    .leftJoin(editions, eq(editions.id, reading_logs.edition_id))
    .where(and(eq(reading_logs.id, logId), visibleLogs(viewer)))
    .limit(1)

  if (!log) {
    throw createError({
      statusCode: 404,
      data: { error: 'nao_encontrado', message: 'Registro de leitura não encontrado.' },
    })
  }

  const rows = await db
    .select({
      id: reading_blocks.id,
      log_id: reading_blocks.log_id,
      user_id: reading_blocks.user_id,
      start_page: reading_blocks.start_page,
      end_page: reading_blocks.end_page,
      comment: reading_blocks.comment,
      read_at: reading_blocks.read_at,
      created_at: reading_blocks.created_at,
      updated_at: reading_blocks.updated_at,
    })
    .from(reading_blocks)
    .where(eq(reading_blocks.log_id, logId))
    .orderBy(desc(reading_blocks.read_at), desc(reading_blocks.created_at))

  const intervals = rows.map((r) => ({
    start_page: r.start_page,
    end_page: r.end_page,
  }))

  const calc = calculateReadingProgress(
    intervals,
    log.edition_page_count,
    Boolean(log.finished_on),
  )

  const progress: ReadingProgressView = {
    pages_read: calc.pagesRead,
    current_page: calc.currentPage,
    total_pages: calc.totalPages,
    percentage: calc.percentage,
    is_complete: calc.isComplete,
  }

  return {
    blocks: rows,
    progress,
  }
}

export async function createBlock(
  logId: string,
  userId: string,
  input: ReadingBlockInput,
): Promise<ReadingBlockView> {
  const [log] = await db
    .select({ id: reading_logs.id, user_id: reading_logs.user_id })
    .from(reading_logs)
    .where(eq(reading_logs.id, logId))
    .limit(1)

  if (!log) {
    throw createError({
      statusCode: 404,
      data: { error: 'nao_encontrado', message: 'Registro de leitura não encontrado.' },
    })
  }

  if (log.user_id !== userId) {
    throw createError({
      statusCode: 403,
      data: { error: 'proibido', message: 'Apenas o leitor pode adicionar blocos a esta leitura.' },
    })
  }

  const [created] = await db
    .insert(reading_blocks)
    .values({
      log_id: logId,
      user_id: userId,
      start_page: input.start_page,
      end_page: input.end_page,
      comment: input.comment ? input.comment.trim() : null,
      read_at: input.read_at ?? undefined,
    })
    .returning()

  if (!created) {
    throw createError({
      statusCode: 500,
      data: { error: 'erro_interno', message: 'Não foi possível salvar o bloco de leitura.' },
    })
  }

  // Touch the reading log's updated_at
  await db
    .update(reading_logs)
    .set({ updated_at: new Date() })
    .where(eq(reading_logs.id, logId))

  return created
}

export async function updateBlock(
  blockId: string,
  userId: string,
  input: UpdateReadingBlockInput,
): Promise<ReadingBlockView> {
  const [existing] = await db
    .select()
    .from(reading_blocks)
    .where(eq(reading_blocks.id, blockId))
    .limit(1)

  if (!existing) {
    throw createError({
      statusCode: 404,
      data: { error: 'nao_encontrado', message: 'Bloco de leitura não encontrado.' },
    })
  }

  if (existing.user_id !== userId) {
    throw createError({
      statusCode: 403,
      data: { error: 'proibido', message: 'Você não tem permissão para editar este bloco.' },
    })
  }

  const finalStart = input.start_page ?? existing.start_page
  const finalEnd = input.end_page ?? existing.end_page

  if (finalEnd < finalStart) {
    throw createError({
      statusCode: 400,
      data: { error: 'requisicao_invalida', message: 'A página final deve ser maior ou igual à página inicial.' },
    })
  }

  const [updated] = await db
    .update(reading_blocks)
    .set({
      start_page: finalStart,
      end_page: finalEnd,
      comment: input.comment !== undefined ? (input.comment ? input.comment.trim() : null) : existing.comment,
      read_at: input.read_at ?? existing.read_at,
      updated_at: new Date(),
    })
    .where(eq(reading_blocks.id, blockId))
    .returning()

  // Touch the reading log's updated_at
  await db
    .update(reading_logs)
    .set({ updated_at: new Date() })
    .where(eq(reading_logs.id, existing.log_id))

  if (!updated) {
    throw createError({
      statusCode: 500,
      data: { error: 'erro_interno', message: 'Não foi possível atualizar o bloco de leitura.' },
    })
  }

  return updated
}

export async function deleteBlock(
  blockId: string,
  userId: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: reading_blocks.id, user_id: reading_blocks.user_id, log_id: reading_blocks.log_id })
    .from(reading_blocks)
    .where(eq(reading_blocks.id, blockId))
    .limit(1)

  if (!existing) {
    throw createError({
      statusCode: 404,
      data: { error: 'nao_encontrado', message: 'Bloco de leitura não encontrado.' },
    })
  }

  if (existing.user_id !== userId) {
    throw createError({
      statusCode: 403,
      data: { error: 'proibido', message: 'Você não tem permissão para excluir este bloco.' },
    })
  }

  await db.delete(reading_blocks).where(eq(reading_blocks.id, blockId))

  await db
    .update(reading_logs)
    .set({ updated_at: new Date() })
    .where(eq(reading_logs.id, existing.log_id))
}
