import { getCookie } from 'h3'
import type { AuthSessionState, AuthSessionUser } from './auth'

// Better-auth's session cookie. server/services/auth.ts always sets useSecureCookies, so the __Secure- prefix is used.
const SESSION_COOKIE = '__Secure-better-auth.session_token'

function hasProfile(session: AuthSessionState | null): boolean {
  if (!session?.user) return false
  return Boolean(session.hasProfile || session.user.hasProfile || session.user.handle)
}

export default defineNuxtRouteMiddleware(async () => {
  const nuxtApp = useNuxtApp()
  const session = useState<AuthSessionState>('auth:session', () => ({
    user: null,
    fetched: false,
  }))

  const applyLayout = () => {
    setPageLayout(hasProfile(session.value) ? 'app' : 'default')
  }

  if (session.value?.fetched) {
    nuxtApp.runWithContext(applyLayout)
    return
  }

  if (typeof $fetch === 'undefined') {
    nuxtApp.runWithContext(applyLayout)
    return
  }

  // Server only (ssrContext exists only during SSR). A cookie-less SSR response is anonymous; if any cache
  // ever stored one and served it to a signed-in member, fetched: true would put "signed out" into that
  // copy's payload. So the session stays unfetched and the client asks /api/users/me again on hydration.
  const requestEvent = nuxtApp.ssrContext?.event
  if (requestEvent && !getCookie(requestEvent, SESSION_COOKIE)) {
    nuxtApp.runWithContext(applyLayout)
    return
  }

  const requestFetch = useRequestFetch()

  try {
    const profile = await requestFetch<AuthSessionUser | null>('/api/users/me')
    session.value = profile
      ? { user: { ...profile, hasProfile: true }, hasProfile: true, fetched: true }
      : { user: { hasProfile: false }, hasProfile: false, fetched: true }
  }
  catch {
    session.value = { user: null, hasProfile: false, fetched: true }
  }

  nuxtApp.runWithContext(applyLayout)
})
