import { and, eq, inArray, or, sql } from 'drizzle-orm'
import type { MemberRecentCover, MembersResponse, MemberView } from '../../shared/schemas/members'
import { db } from '../db'
import { editions, reading_logs, users, works } from '../db/schema'
import { visibleLogs, type Viewer } from './visibility'

export async function listMembers(viewer: Viewer): Promise<MembersResponse> {
  const userCondition = viewer?.id
    ? or(eq(users.profile_visibility, 'publico'), eq(users.id, viewer.id))
    : eq(users.profile_visibility, 'publico')

  const userRows = await db
    .select({
      id: users.id,
      handle: users.handle,
      display_name: users.display_name,
      bio: users.bio,
    })
    .from(users)
    .where(userCondition)

  if (userRows.length === 0) {
    return { members: [] }
  }

  const userIds = userRows.map((u) => u.id)

  const statsRows = await db
    .select({
      user_id: reading_logs.user_id,
      count: sql<number>`count(${reading_logs.id})::int`,
      last_activity_at: sql<Date | string | null>`max(${reading_logs.created_at})`,
    })
    .from(reading_logs)
    .innerJoin(users, eq(users.id, reading_logs.user_id))
    .where(and(inArray(reading_logs.user_id, userIds), visibleLogs(viewer)))
    .groupBy(reading_logs.user_id)

  const whereLogsCondition = and(inArray(reading_logs.user_id, userIds), visibleLogs(viewer))

  const coversRows = await db.execute<{
    user_id: string
    work_title: string
    cover_url: string | null
    ol_cover_id: number | null
    isbn13: string | null
  }>(sql`
    WITH ranked_logs AS (
      SELECT
        ${reading_logs.user_id} AS user_id,
        ${works.title} AS work_title,
        COALESCE(
          ${editions.cover_url},
          (
            SELECT e.cover_url
            FROM ${editions} e
            WHERE e.work_id = ${works.id} AND e.cover_url IS NOT NULL
            ORDER BY e.created_at, e.id
            LIMIT 1
          )
        ) AS cover_url,
        COALESCE(
          ${editions.ol_cover_id},
          (
            SELECT e.ol_cover_id
            FROM ${editions} e
            WHERE e.work_id = ${works.id} AND e.ol_cover_id IS NOT NULL
            ORDER BY e.created_at, e.id
            LIMIT 1
          )
        ) AS ol_cover_id,
        COALESCE(
          ${editions.isbn13},
          (
            SELECT e.isbn13
            FROM ${editions} e
            WHERE e.work_id = ${works.id} AND e.isbn13 IS NOT NULL
            ORDER BY e.created_at, e.id
            LIMIT 1
          )
        ) AS isbn13,
        ${reading_logs.created_at} AS created_at,
        ROW_NUMBER() OVER (
          PARTITION BY ${reading_logs.user_id}
          ORDER BY ${reading_logs.created_at} DESC, ${reading_logs.id} DESC
        ) AS rn
      FROM ${reading_logs}
      INNER JOIN ${users} ON ${users.id} = ${reading_logs.user_id}
      INNER JOIN ${works} ON ${works.id} = ${reading_logs.work_id}
      LEFT JOIN ${editions} ON ${editions.id} = ${reading_logs.edition_id}
      WHERE ${whereLogsCondition}
    )
    SELECT user_id, work_title, cover_url, ol_cover_id, isbn13
    FROM ranked_logs
    WHERE rn <= 4
    ORDER BY user_id, rn ASC
  `)

  const statsByUserId = new Map<string, { count: number; lastActivityAt: string | null }>()
  for (const s of statsRows) {
    const lastAt = s.last_activity_at instanceof Date
      ? s.last_activity_at.toISOString()
      : (s.last_activity_at ? new Date(s.last_activity_at).toISOString() : null)
    statsByUserId.set(s.user_id, {
      count: Number(s.count),
      lastActivityAt: lastAt,
    })
  }

  const coversByUserId = new Map<string, MemberRecentCover[]>()
  for (const c of coversRows) {
    let list = coversByUserId.get(c.user_id)
    if (!list) {
      list = []
      coversByUserId.set(c.user_id, list)
    }
    if (list.length < 4) {
      list.push({
        work_title: c.work_title,
        cover_url: c.cover_url ?? null,
        ol_cover_id: c.ol_cover_id === null ? null : Number(c.ol_cover_id),
        isbn13: c.isbn13 ?? null,
      })
    }
  }

  const members: MemberView[] = userRows.map((u) => {
    const stats = statsByUserId.get(u.id)
    return {
      handle: u.handle,
      display_name: u.display_name,
      bio: u.bio ?? null,
      visible_log_count: stats?.count ?? 0,
      last_activity_at: stats?.lastActivityAt ?? null,
      recent_covers: coversByUserId.get(u.id) ?? [],
    }
  })

  members.sort((a, b) => {
    if (a.last_activity_at && b.last_activity_at) {
      const cmp = new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime()
      if (cmp !== 0) return cmp
    } else if (a.last_activity_at && !b.last_activity_at) {
      return -1
    } else if (!a.last_activity_at && b.last_activity_at) {
      return 1
    }
    return a.display_name.localeCompare(b.display_name, 'pt-BR')
  })

  return { members }
}
