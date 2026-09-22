import type { AuthSessionState, AuthSessionUser } from './auth'

function hasProfile(session: AuthSessionState | null): boolean {
  if (!session?.user) return false
  return Boolean(session.hasProfile || session.user.hasProfile || session.user.handle)
}

/**
 * Picks the layout for public routes before either side renders it.
 *
 * Routes like `/`, `/entrada/[id]`, `/livro/[slug]`, and `/@handle` depend on
 * who is asking: a stranger gets the `default` layout with "Entrar", a member
 * gets `app` with "Registrar livro", "Perfil" and "Sair". Deciding that inside
 * the page's `setup()` is what raises **NUXT_E2007** — by then the server has
 * already committed to a layout, so SSR emits the anonymous shell and the client
 * swaps to the member one. Every node under `<nav>` then mismatches on
 * hydration, and because the layout wraps the page, so does the page's own root.
 * Route middleware runs before rendering on both sides, so both agree.
 *
 * Same discipline as `auth.ts`, for the same reason: every composable is
 * resolved *before* the first `await` — reaching for one afterwards throws
 * NUXT_E1001 during SSR — and `setPageLayout` is itself a composable, so it
 * runs inside `runWithContext`.
 *
 * The session lands in the shared `auth:session` state, which is what pages
 * read instead of asking `/api/users/me` a second time.
 */
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

  // Unit tests mount pages without a server to answer this call.
  if (typeof $fetch === 'undefined') {
    nuxtApp.runWithContext(applyLayout)
    return
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

  nuxtApp.runWithContext(applyLayout)
})
