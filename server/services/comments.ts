import { and, asc, eq, exists, gt, isNull, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { createError } from 'h3'
import { commentInputSchema, type CommentInput, type CommentPageResponse, type CommentQuery, type CommentView } from '../../shared/schemas/comment'
import { db } from '../db'
import { comments, reading_blocks, reading_logs, users } from '../db/schema'
import { parseOrThrow } from '../utils/api'
import { visibleLogs, type Viewer } from './visibility'

const commentAuthor = alias(users, 'comment_author')

function notFound() {
  return createError({
    statusCode: 404,
    data: { error: 'nao_encontrado', message: 'Conversa não encontrada.' },
  })
}

function conversationTarget(blockId: string | null | undefined) {
  return blockId
    ? exists(db.select({ id: reading_blocks.id }).from(reading_blocks).where(and(
        eq(reading_blocks.id, blockId), eq(reading_blocks.log_id, reading_logs.id),
      )))
    : sql`${reading_logs.review} ~ '[^[:space:]]'`
}

export async function getCommentsForLog(logId: string, viewer: Viewer, query: CommentQuery): Promise<CommentPageResponse> {
  const visibility = visibleLogs(viewer)
  const target = conversationTarget(query.block_id)
  const [log] = await db.select({ id: reading_logs.id }).from(reading_logs)
    .innerJoin(users, eq(users.id, reading_logs.user_id))
    .where(and(eq(reading_logs.id, logId), visibility, target)).limit(1)
  if (!log) throw notFound()

  const cursor = query.cursor
  const rows = await db.select({
    id: comments.id,
    log_id: comments.log_id,
    block_id: comments.block_id,
    body: comments.body,
    created_at: sql<string>`to_char(${comments.created_at} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    // Keep PostgreSQL microseconds: JavaScript Date would round the pagination boundary.
    cursor_created_at: sql<string>`to_char(${comments.created_at} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    user: { handle: commentAuthor.handle, display_name: commentAuthor.display_name },
    can_delete: viewer ? sql<boolean>`${comments.user_id} = ${viewer.id} OR ${reading_logs.user_id} = ${viewer.id}` : sql<boolean>`false`,
  }).from(comments)
    .innerJoin(reading_logs, eq(reading_logs.id, comments.log_id))
    .innerJoin(users, eq(users.id, reading_logs.user_id))
    .innerJoin(commentAuthor, eq(commentAuthor.id, comments.user_id))
    .where(and(
      eq(comments.log_id, logId), visibility, target,
      query.block_id ? eq(comments.block_id, query.block_id) : isNull(comments.block_id),
      cursor ? or(
        sql`${comments.created_at} > ${cursor.created_at}::timestamptz`,
        and(sql`${comments.created_at} = ${cursor.created_at}::timestamptz`, gt(comments.id, cursor.id)),
      ) : undefined,
    )).orderBy(asc(comments.created_at), asc(comments.id)).limit(query.limit + 1)

  const page = rows.slice(0, query.limit)
  const last = page.at(-1)
  return {
    comments: page.map(({ cursor_created_at: _cursor, ...comment }) => comment),
    nextCursor: rows.length > query.limit && last ? JSON.stringify({ created_at: last.cursor_created_at, id: last.id }) : null,
  }
}

export async function createComment(logId: string, userId: string, input: CommentInput): Promise<CommentView> {
  const parsed = parseOrThrow(commentInputSchema, input)
  // INSERT ... SELECT authorizes the target in the same statement that writes it.
  const inserted = db.$with('created_comment').as(db.insert(comments).select(
    db.select({
      id: sql<string>`gen_random_uuid()`.as('id'),
      log_id: reading_logs.id,
      block_id: sql<string | null>`${parsed.block_id ?? null}::uuid`.as('block_id'),
      user_id: sql<string>`${userId}::uuid`.as('user_id'),
      body: sql<string>`${parsed.body}`.as('body'),
      created_at: sql<Date>`now()`.as('created_at'),
    }).from(reading_logs).innerJoin(users, eq(users.id, reading_logs.user_id))
      .where(and(eq(reading_logs.id, logId), visibleLogs({ id: userId }), conversationTarget(parsed.block_id))),
  ).returning())

  const [created] = await db.with(inserted).select({
    id: inserted.id,
    log_id: inserted.log_id,
    block_id: inserted.block_id,
    body: inserted.body,
    created_at: sql<string>`to_char(${inserted.created_at} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    user: { handle: commentAuthor.handle, display_name: commentAuthor.display_name },
    can_delete: sql<boolean>`true`,
  }).from(inserted).innerJoin(commentAuthor, eq(commentAuthor.id, inserted.user_id))
  if (!created) throw notFound()
  return created
}

export async function deleteComment(logId: string, commentId: string, userId: string): Promise<void> {
  const permission = exists(db.select({ id: reading_logs.id }).from(reading_logs)
    .innerJoin(users, eq(users.id, reading_logs.user_id))
    .where(and(eq(reading_logs.id, comments.log_id), visibleLogs({ id: userId }),
      or(eq(comments.user_id, userId), eq(reading_logs.user_id, userId)),
    )))
  const [deleted] = await db.delete(comments)
    .where(and(eq(comments.id, commentId), eq(comments.log_id, logId), permission))
    .returning({ id: comments.id })
  if (!deleted) throw notFound()
}
