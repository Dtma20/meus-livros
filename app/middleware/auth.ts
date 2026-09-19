export default defineNuxtRouteMiddleware((to) => {
  // Stub session until TASK-007 (better-auth integration)
  const session = useState<{ user: unknown | null }>('auth:session', () => ({ user: null }))

  if (!session.value.user && to.path.startsWith('/app')) {
    return navigateTo(`/entrar?next=${to.fullPath}`, {
      redirectCode: 302
    })
  }
})
