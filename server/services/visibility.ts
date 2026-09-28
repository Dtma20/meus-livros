import { and, eq, or, type SQL } from 'drizzle-orm'
import { reading_logs, users } from '../db/schema'

export type Viewer = { id: string } | null

export function visibleLogs(viewer: Viewer): SQL {
  if (viewer === undefined) {
    throw new TypeError(
      'visibleLogs: o parâmetro viewer é obrigatório. Passe { id: string } para usuários autenticados ou null para anônimos.',
    )
  }

  return viewer
    ? or(
        eq(reading_logs.user_id, viewer.id),
        and(eq(reading_logs.visibility, 'publico'), eq(users.profile_visibility, 'publico')),
      )!
    : and(eq(reading_logs.visibility, 'publico'), eq(users.profile_visibility, 'publico'))!
}

