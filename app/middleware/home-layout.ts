import type { AuthSessionState, AuthSessionUser } from './auth'

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
