import { createError, defineEventHandler, getRequestHeader, getRequestHost } from 'h3'

/**
 * CSRF defence in depth: reject a mutating request whose `Origin` names a host
 * other than ours. `security.md` §"Origin is checked against the expected host
 * on every mutating request" asks for this and calls it ten lines of cheap
 * insurance, which is exactly right — the session cookie is `SameSite=Lax`, so
 * this is the second lock, not the first.
 *
 * Compared against the request's own `Host`, not against a configured origin.
 * A forged cross-site POST carries the attacker's `Origin` and our `Host`, so
 * the mismatch is the signal; `BETTER_AUTH_URL` is accepted as well so a
 * deployment behind a canonical domain still works when the two differ.
 *
 * **A missing `Origin` is allowed, deliberately.** Browsers always send it on
 * cross-origin mutating requests, which is the whole threat; they omit it in
 * cases that are not the threat, and so does everything that is not a browser
 * — Nitro's in-process `$fetch` during SSR, the integration suite building a
 * bare `new Request(...)`, curl. Requiring presence would break all of those
 * to close nothing.
 */
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export default defineEventHandler((event) => {
  if (!MUTATING.has(event.method)) {
    return
  }

  const origin = getRequestHeader(event, 'origin')
  if (!origin) {
    return
  }

  let originHost: string
  try {
    originHost = new URL(origin).host
  }
  catch {
    // A malformed Origin is not something a browser produces.
    throw createError({
      statusCode: 403,
      data: { error: 'origem_invalida', message: 'Origem da requisição inválida.' },
    })
  }

  const allowed = new Set<string>([getRequestHost(event)])
  const canonical = process.env.BETTER_AUTH_URL
  if (canonical) {
    try {
      allowed.add(new URL(canonical).host)
    }
    catch {
      // An unparseable BETTER_AUTH_URL is a deployment error, not a request
      // error: fall through and judge on Host alone rather than locking
      // everyone out of a running site.
    }
  }

  if (!allowed.has(originHost)) {
    throw createError({
      statusCode: 403,
      data: { error: 'origem_invalida', message: 'Origem da requisição inválida.' },
    })
  }
})
