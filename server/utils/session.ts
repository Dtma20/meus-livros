import type { H3Event } from 'h3'
import { createError } from 'h3'
import { getSessionUserByHeaders } from '../services/auth'
import type { SessionUser } from '../services/auth'

export type { SessionUser }

/**
 * The single seam between the catalogue and authentication.
 *
 * Checks event.context.user first (preserving existing test stubs),
 * then validates the database-backed session token via better-auth.
 */
export async function getSessionUser(event: H3Event): Promise<SessionUser | null> {
  const contextUser = event.context.user as SessionUser | undefined
  if (contextUser?.id) {
    return { id: contextUser.id, email: contextUser.email }
  }

  // `event.headers`, never `toWebRequest(event).headers`.
  //
  // toWebRequest builds `new Request(url, { body: getRequestWebStream(event),
  // duplex: 'half' })`. That attaches a ReadableStream over `event.node.req` to
  // a Request object, and during the very next `await` — here, a round trip to
  // Neon to validate the session — the stream drains the node request. A later
  // `readBody(event)` then waits on `data`/`end` events that have already
  // fired, and waits forever.
  //
  // Every authenticated mutating route did exactly that: resolve the session,
  // then read the body. POST /api/logs, POST /api/users, PATCH /api/logs/:id,
  // PATCH /api/users/me, POST /api/works, POST /api/works/:id/editions — the
  // whole write path hung, in dev and in the production build alike. Reproduced
  // minimally: toWebRequest + a 600 ms await + readBody hangs; the same await
  // without toWebRequest returns in 614 ms.
  //
  // better-auth only ever needed the headers, and `event.headers` is the same
  // Headers instance toWebRequest would have copied.
  const user = await getSessionUserByHeaders(event.headers)
  if (user) {
    event.context.user = user
  }
  return user
}

/** The session, or a 401 in the project's error shape. */
export async function requireSessionUser(event: H3Event): Promise<SessionUser> {
  const user = await getSessionUser(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      data: { error: 'nao_autenticado', message: 'É necessário entrar para continuar.' },
    })
  }
  return user
}
