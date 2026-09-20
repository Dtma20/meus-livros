import fs from 'node:fs'
import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const serverPath = path.resolve('.vercel/output/functions/__fallback.func/index.mjs')

// Rebuild when the bundle is missing OR older than any source it is built from.
// Checking only for existence serves a stale bundle, which reports the previous
// commit's routes as if they were this one's.
function newestSourceMtime(dir: string): number {
  if (!fs.existsSync(dir)) return 0
  let newest = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    newest = Math.max(newest, entry.isDirectory() ? newestSourceMtime(full) : fs.statSync(full).mtimeMs)
  }
  return newest
}

function bundleIsStale(): boolean {
  if (!fs.existsSync(serverPath)) return true
  const built = fs.statSync(serverPath).mtimeMs
  const sources = Math.max(
    newestSourceMtime(path.resolve('app')),
    newestSourceMtime(path.resolve('server')),
    fs.existsSync(path.resolve('nuxt.config.ts')) ? fs.statSync(path.resolve('nuxt.config.ts')).mtimeMs : 0,
  )
  return sources > built
}

describe('Route integration HTTP tests', () => {
  let child: ChildProcess
  let baseUrl: string

  beforeAll(async () => {
    if (bundleIsStale()) {
      const { loadNuxt, build } = await import('nuxt')
      const nuxt = await loadNuxt({ dev: false, ready: true })
      await build(nuxt)
      await nuxt.close()
    }

    const env = { ...process.env }
    delete env.NODE_OPTIONS
    delete env.VITEST
    delete env.VITEST_WORKER_ID

    child = spawn('node', [path.resolve('tests/integration/server-runner.mjs')], {
      env,
      stdio: ['ignore', 'pipe', 'inherit']
    })

    await new Promise<void>((resolve, reject) => {
      child.stdout?.on('data', (data) => {
        const str = data.toString()
        const match = str.match(/PORT:(\d+)/)
        if (match && match[1]) {
          baseUrl = `http://127.0.0.1:${match[1]}`
          resolve()
        }
      })
      child.on('error', reject)
    })
  }, 120000)

  afterAll(() => {
    if (child) {
      child.kill()
    }
  })

  it('GET / returns 200 and renders default layout with footer attribution', async () => {
    const res = await fetch(`${baseUrl}/`, { redirect: 'manual' })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Início')
    expect(html).toContain('Dados bibliográficos parcialmente do Open Library')
    expect(html).toContain('Meus Livros')
  })

  it('GET /@<handle desconhecido> returns 404', async () => {
    // No longer the TASK-006 stub. A handle nobody owns has to say so in the
    // status line: the crawler that builds the link preview reads that, and a
    // 200 with an error box would be previewed as a real profile.
    const res = await fetch(`${baseUrl}/@ninguem-tem-esse-handle`, { redirect: 'manual' })
    expect(res.status).toBe(404)
  })

  it('GET /@dtma23 returns 200 and server-renders the profile', async () => {
    const res = await fetch(`${baseUrl}/@dtma23`, { redirect: 'manual' })
    expect(res.status).toBe(200)
    const html = await res.text()
    // Server-rendered: the name is in the first response, no JavaScript run.
    expect(html).toContain('Diogo Amorim')
    expect(html).toContain('@dtma23')
  })

  it('GET /livro/<slug desconhecido> returns 404, not a 200 with an error box', async () => {
    // No longer the TASK-006 stub. The crawler that builds the WhatsApp preview
    // reads the status of the first response, so a work that does not exist has
    // to say so in the status line and not only in the body.
    const res = await fetch(`${baseUrl}/livro/slug-que-nao-existe`, { redirect: 'manual' })
    expect(res.status).toBe(404)
  })

  it('GET /livro/<slug real> returns 200 and server-renders the title', async () => {
    const res = await fetch(`${baseUrl}/livro/1984`, { redirect: 'manual' })
    expect(res.status).toBe(200)
    // Server-rendered, so the title is in the first response with no JavaScript run.
    expect(await res.text()).toContain('1984')
  })

  it('GET /entrada/<id> returns 200 and renders the entry page (not the stub)', async () => {
    // The stub is gone: this is now the real entry page. An anonymous request
    // for a non-existent or private id shows the not-found empty state, but
    // the route itself is server-rendered and returns 200.
    const res = await fetch(`${baseUrl}/entrada/nao-existe`, { redirect: 'manual' })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Entrada não encontrada')
    // Sanity: the old stub text is gone
    expect(html).not.toContain('ID da entrada:')
  })

  it('GET /entrar returns 200 and renders login stub', async () => {
    const res = await fetch(`${baseUrl}/entrar`, { redirect: 'manual' })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Entrar')
  })

  it('GET /app/novo unauthenticated returns a redirect to /entrar?next=/app/novo with status 302', async () => {
    const res = await fetch(`${baseUrl}/app/novo`, { redirect: 'manual' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/entrar?next=/app/novo')
  })

  it('GET /app/bem-vindo unauthenticated returns a redirect to /entrar?next=/app/bem-vindo', async () => {
    const res = await fetch(`${baseUrl}/app/bem-vindo`, { redirect: 'manual' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/entrar?next=/app/bem-vindo')
  })

  it('GET /app/perfil unauthenticated returns a redirect to /entrar?next=/app/perfil', async () => {
    const res = await fetch(`${baseUrl}/app/perfil`, { redirect: 'manual' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/entrar?next=/app/perfil')
  })

  it('GET /app/entrada/x/editar unauthenticated returns a redirect to /entrar?next=/app/entrada/x/editar', async () => {
    const res = await fetch(`${baseUrl}/app/entrada/x/editar`, { redirect: 'manual' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/entrar?next=/app/entrada/x/editar')
  })

  it('GET /rota-inexistente renders error.vue with pt-BR copy, status 404, and footer attribution', async () => {
    const res = await fetch(`${baseUrl}/rota-inexistente`, {
      headers: { accept: 'text/html' }
    })
    expect(res.status).toBe(404)
    const html = await res.text()
    expect(html).toContain('404')
    expect(html).toContain('Página não encontrada')
    expect(html).toContain('A página que você procura não existe ou foi removida.')
    expect(html).toContain('Voltar ao início')
    expect(html).toContain('Dados bibliográficos parcialmente do Open Library')
    expect(html).not.toContain('stack')
  })

  it('/robots.txt contains Disallow: /app/', () => {
    const robotsPath = path.resolve('public/robots.txt')
    expect(fs.existsSync(robotsPath)).toBe(true)
    const robotsContent = fs.readFileSync(robotsPath, 'utf8')
    expect(robotsContent).toContain('Disallow: /app/')
  })
})
