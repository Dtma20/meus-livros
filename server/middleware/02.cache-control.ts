import { defineEventHandler, getCookie, setResponseHeader } from 'h3'

// Better-auth's session cookie. server/services/auth.ts sets advanced.useSecureCookies,
// so the __Secure- prefix is always used; no unprefixed dev variant exists.
const SESSION_COOKIE = '__Secure-better-auth.session_token'

// Build assets and static files (any path whose last segment has an extension) are not rendered per session.
const STATIC_PATH = /(^\/_nuxt\/)|(\.[a-z0-9]+$)/i

// Any response rendered for a signed-in viewer must never be stored by a shared cache.
// Pages that set their own Cache-Control still win for anonymous visitors (see entrada/[id].vue).
export default defineEventHandler((event) => {
  const pathname = (event.path || '/').split('?')[0] ?? '/'
  if (STATIC_PATH.test(pathname)) return

  if (getCookie(event, SESSION_COOKIE)) {
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
  }
})
