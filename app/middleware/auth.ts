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
  if (!session?.user) {
    return navigateTo(`/entrar?next=${encodeURIComponent(to.fullPath)}`, { redirectCode: 302 })
  }

  const hasProfile = Boolean(session.hasProfile || session.user.hasProfile || session.user.handle)

  if (!hasProfile && to.path !== '/app/bem-vindo') {
    return navigateTo('/app/bem-vindo', { redirectCode: 302 })
  }
}

export default defineNuxtRouteMiddleware(async (to) => {
  const nuxtApp = useNuxtApp()
  const session = useState<AuthSessionState>('auth:session', () => ({
    user: null,
    fetched: false,
  }))

  if (session.value?.fetched) {
    return evaluateAuth(to, session.value)
  }

  if (typeof $fetch === 'undefined') {
    return evaluateAuth(to, session.value)
  }

  const requestFetch = useRequestFetch()

  try {
    const profile = await requestFetch<AuthSessionUser | null>('/api/users/me', {
      timeout: 15_000,
      retry: 0,
    })
    session.value = profile
      ? { user: { ...profile, hasProfile: true }, hasProfile: true, fetched: true }
      : { user: { hasProfile: false }, hasProfile: false, fetched: true }
  }
  catch {
    session.value = { user: null, hasProfile: false, fetched: true }
  }

  return nuxtApp.runWithContext(() => evaluateAuth(to, session.value))
})
