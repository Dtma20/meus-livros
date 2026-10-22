// Only this deployment's exact URLs are trusted in Preview, never *.vercel.app.
// Production continues to use the configured canonical origin.
export function getAppOrigins(): string[] {
  if (process.env.VERCEL_ENV === 'preview') {
    const previewOrigins = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]
      .filter((host): host is string => Boolean(host && /^[a-z0-9-]+\.vercel\.app$/i.test(host)))
      .map(host => `https://${host}`)
    if (previewOrigins.length) return [...new Set(previewOrigins)]
  }

  return process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []
}
