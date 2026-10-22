import { describe, expect, it } from 'vitest'
import { createApp, eventHandler, setResponseHeader, toWebHandler } from 'h3'
import cacheControl from '../../server/middleware/02.cache-control'

const SESSION_COOKIE = '__Secure-better-auth.session_token=token-de-teste'

// A page handler that, like the pages, may set its own Cache-Control after the middleware runs.
function buildApp(pageCacheControl?: string) {
  const app = createApp()
  app.use(cacheControl)
  app.use(eventHandler((event) => {
    if (pageCacheControl) setResponseHeader(event, 'Cache-Control', pageCacheControl)
    return 'ok'
  }))
  return toWebHandler(app)
}

async function get(path: string, headers: Record<string, string> = {}, pageCacheControl?: string) {
  const handler = buildApp(pageCacheControl)
  return handler(new Request(`http://localhost${path}`, { headers }))
}

describe('02.cache-control middleware', () => {
  it('marks a response private and uncacheable when the session cookie is present', async () => {
    const res = await get('/entrada/abc', { cookie: SESSION_COOKIE })

    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it('applies to the session cookie on any path that is not static', async () => {
    const res = await get('/app/perfil', { cookie: `outro=1; ${SESSION_COOKIE}` })

    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it('leaves anonymous responses alone so the page can set its own cache policy', async () => {
    const res = await get('/entrada/abc', {}, 'public, max-age=60, s-maxage=60')

    expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=60')
  })

  it('does not treat other cookies as a session', async () => {
    const res = await get('/entrada/abc', { cookie: 'better-auth.session_token=x' })

    expect(res.headers.get('cache-control')).toBeNull()
  })

  it('does not touch build assets or static files, even with a session cookie', async () => {
    const assets = await get('/_nuxt/entry.js', { cookie: SESSION_COOKIE })
    const image = await get('/og-fallback.png', { cookie: SESSION_COOKIE })
    const query = await get('/_nuxt/chunk.js?v=1', { cookie: SESSION_COOKIE })

    expect(assets.headers.get('cache-control')).toBeNull()
    expect(image.headers.get('cache-control')).toBeNull()
    expect(query.headers.get('cache-control')).toBeNull()
  })
})
