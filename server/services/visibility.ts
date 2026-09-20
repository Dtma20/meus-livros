import { and, eq, or, type SQL } from 'drizzle-orm'
import { reading_logs, users } from '../db/schema'

export type Viewer = { id: string } | null

/**
 * The single most important authorization helper.
 * Every read of reading_logs goes through it.
 *
 * Rule: A log is visible if:
 * - log.user_id = viewer.id (the owner can always see their own log, even if private)
 * OR
 * - log.visibility = 'publico' AND author.profile_visibility = 'publico'
 *
 * Viewer is NOT optional — callers must pass null explicitly when unauthenticated.
 */
export function visibleLogs(viewer: Viewer): SQL {
  return viewer
    ? or(
        eq(reading_logs.user_id, viewer.id),
        and(eq(reading_logs.visibility, 'publico'), eq(users.profile_visibility, 'publico')),
      )!
    : and(eq(reading_logs.visibility, 'publico'), eq(users.profile_visibility, 'publico'))!
}
