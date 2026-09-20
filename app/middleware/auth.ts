export interface AuthSessionUser {
  id?: string
  email?: string
  handle?: string
  display_name?: string
  bio?: string | null
  profile_visibility?: 'publico' | 'privado'
  hasProfile?: boolean
  [key: string]: unknown
}

export interface AuthSessionState {
  user: AuthSessionUser | null
  hasProfile?: boolean
  fetched?: boolean
}

function evaluateAuth(to: { path: string, fullPath: string }, session: AuthSessionState | null) {
  // 1. Unauthenticated: any route in /app/** redirects to login
  if (!session?.user) {
    return navigateTo(`/entrar?next=${to.fullPath}`, { redirectCode: 302 })
  }

  // 2. Authenticated without profile: /app/bem-vindo is the only reachable route.
  // Excluding it is what stops the redirect looping onto itself.
  const hasProfile = Boolean(session.hasProfile || session.user.hasProfile || session.user.handle)

  if (!hasProfile && to.path !== '/app/bem-vindo') {
    return navigateTo('/app/bem-vindo', { redirectCode: 302 })
  }
}

/**
 * Gates `/app/**` on having a profile, not merely on being signed in.
 *
 * Every composable this needs — the shared state, the request-scoped fetch, the
 * Nuxt instance — is resolved *before* the first `await`. Reaching for one
 * afterwards throws NUXT_E1001 during SSR, which turns what should be a 302
 * into a 500, and the redirect that was supposed to protect the route stops
 * protecting it. For the same reason the final `evaluateAuth` runs inside
 * `runWithContext`: `navigateTo` is a composable too.
 *
 * `useRequestFetch` rather than plain `$fetch`: on the server it forwards the
 * incoming cookies, and the session cookie is the whole question being asked.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith('/app')) {
    return
  }

  const nuxtApp = useNuxtApp()
  const session = useState<AuthSessionState>('auth:session', () => ({
    user: null,
    fetched: false,
  }))

  if (session.value?.fetched) {
    return evaluateAuth(to, session.value)
  }

  // Unit tests mount pages without a server to answer this call.
  if (typeof $fetch === 'undefined') {
    return evaluateAuth(to, session.value)
  }

  const requestFetch = useRequestFetch()

  try {
    const profile = await requestFetch<AuthSessionUser | null>('/api/users/me')
    session.value = profile
      // A verified identity with no `users` row: signed in, but no profile yet.
      ? { user: { ...profile, hasProfile: true }, hasProfile: true, fetched: true }
      : { user: { hasProfile: false }, hasProfile: false, fetched: true }
  }
  catch {
    // 401, or the endpoint could not be reached: treat as signed out.
    session.value = { user: null, hasProfile: false, fetched: true }
  }

  return nuxtApp.runWithContext(() => evaluateAuth(to, session.value))
})
