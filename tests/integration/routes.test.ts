import fs from 'node:fs'
import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { stopServer, waitForServerPort } from './server-process'
import { removeFixtures, uniqueIsbn13 } from './fixtures'

describe('Route integration HTTP tests', () => {
  let child: ChildProcess
  let baseUrl: string

  const workMarker = `zz-teste-rota-${Date.now()}`
  let realWork: { id: string; slug: string; title: string } | null = null
  let publicLogId: string | null = null
  let profileFixture: { id: string; handle: string; display_name: string } | null = null
  let editionId: string | undefined
  const fixtureIsbn = uniqueIsbn13()

  beforeAll(async () => {

    const env = { ...process.env }
    delete env.NODE_OPTIONS
    delete env.VITEST
    delete env.VITEST_WORKER_ID

    child = spawn('node', [path.resolve('tests/integration/server-runner.mjs')], {
      env,
      stdio: ['ignore', 'pipe', 'inherit'],
    })

    baseUrl = await waitForServerPort(child)

    const dbModule = await import('../../server/db')
    const schemaModule = await import('../../server/db/schema')
    const [row] = await dbModule.db
      .insert(schemaModule.works)
      .values({ slug: workMarker, title: `${workMarker} Obra` })
      .returning({
        id: schemaModule.works.id,
        slug: schemaModule.works.slug,
        title: schemaModule.works.title,
      })
    realWork = row ?? null
    if (!realWork) throw new Error('Obra fixture não criada.')
    const [edition] = await dbModule.db.insert(schemaModule.editions).values({
      work_id: realWork.id, isbn13: fixtureIsbn, publisher: 'Editora Fixture', page_count: 214, published_year: 2024,
    }).returning({ id: schemaModule.editions.id })
    editionId = edition?.id
    const [controlWork] = await dbModule.db.insert(schemaModule.works).values({
      slug: `${workMarker}-control`, title: `${workMarker} Controle`,
    }).returning({ id: schemaModule.works.id })
    if (!controlWork || !editionId) throw new Error('Edição/obra de controle não criadas.')
    await dbModule.db.insert(schemaModule.editions).values({ work_id: controlWork.id, publisher: 'Outra obra' })

    const [owner] = await dbModule.db
      .insert(schemaModule.users)
      .values({
        email: `${workMarker}@teste.invalid`,
        handle: `ucache_${Date.now() % 10000000}`,
        display_name: 'Usuário Cache',
        profile_visibility: 'publico',
      })
      .returning({
        id: schemaModule.users.id,
        handle: schemaModule.users.handle,
        display_name: schemaModule.users.display_name,
      })
    profileFixture = owner ?? null
    const [log] = await dbModule.db
      .insert(schemaModule.reading_logs)
      .values({
        user_id: owner!.id,
        work_id: realWork!.id,
        finished_on: '2024-01-01',
        finished_precision: 'dia',
        format: 'fisico',
        visibility: 'publico',
      })
      .returning({ id: schemaModule.reading_logs.id })
    publicLogId = log?.id ?? null
  }, 120000)

  afterAll(async () => {
    try {

      await removeFixtures(workMarker)
    } finally {
      await stopServer(child)
    }
  })

  it('GET / returns 200 and renders default layout', async () => {
    const res = await fetch(`${baseUrl}/`, { redirect: 'manual' })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Terminou o livro? Conte pro grupo.')
    expect(html).toContain('Meus Livros')
  })

  it('GET /api/works/:id/editions returns 200 and JSON editions array (not shadowed by the work GET route)', async () => {
    expect(realWork).not.toBeNull()
    const res = await fetch(`${baseUrl}/api/works/${realWork!.id}/editions`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    const data = await res.json()
    expect(data).toEqual({ editions: [{
      id: editionId, isbn13: fixtureIsbn, publisher: 'Editora Fixture',
      cover_url: null, ol_cover_id: null, page_count: 214, published_year: 2024,
    }] })

    const nonExistentRes = await fetch(`${baseUrl}/api/works/00000000-0000-4000-8000-000000000000/editions`)
    expect(nonExistentRes.status).toBe(200)
    const nonExistentData = await nonExistentRes.json()
    expect(nonExistentData.editions).toEqual([])
  })

  it('GET /@<handle desconhecido> returns 404', async () => {

    const res = await fetch(`${baseUrl}/@ninguem-tem-esse-handle`, { redirect: 'manual' })
    expect(res.status).toBe(404)
  })

  it('GET /@<handle fixture> returns 200 and server-renders the profile', async () => {
    expect(profileFixture).not.toBeNull()
    const res = await fetch(`${baseUrl}/@${encodeURIComponent(profileFixture!.handle)}`, { redirect: 'manual' })
    expect(res.status).toBe(200)
    const html = await res.text()

    expect(html).toContain(profileFixture!.display_name)
    expect(html).toContain(`@${profileFixture!.handle}`)
  })

  it('GET /livro/<slug desconhecido> returns 404, not a 200 with an error box', async () => {

    const res = await fetch(`${baseUrl}/livro/slug-que-nao-existe`, { redirect: 'manual' })
    expect(res.status).toBe(404)
  })

  it('GET /livro/<slug real> returns 200 and server-renders the title', async () => {

    expect(realWork).not.toBeNull()

    const res = await fetch(`${baseUrl}/livro/${encodeURIComponent(realWork!.slug)}`, {
      redirect: 'manual',
    })
    expect(res.status).toBe(200)

    expect(await res.text()).toContain(realWork!.title)
  })

  it('GET /entrada/<id> returns 200 and renders the entry page (not the stub)', async () => {

    const res = await fetch(`${baseUrl}/entrada/nao-existe`, { redirect: 'manual' })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Entrada não encontrada')

    expect(html).not.toContain('ID da entrada:')
  })

  it('GET /entrada/<public id> is shared-cacheable for an anonymous visitor', async () => {
    const res = await fetch(`${baseUrl}/entrada/${publicLogId}`, { redirect: 'manual' })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=60')
  })

  it('GET /entrada/<public id> with the session cookie is never shared-cacheable', async () => {
    const res = await fetch(`${baseUrl}/entrada/${publicLogId}`, {
      redirect: 'manual',
      headers: { cookie: '__Secure-better-auth.session_token=qualquer' },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
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

  it('GET /rota-inexistente renders error.vue with pt-BR copy and status 404', async () => {
    const res = await fetch(`${baseUrl}/rota-inexistente`, {
      headers: { accept: 'text/html' }
    })
    expect(res.status).toBe(404)
    const html = await res.text()

    expect(html).toContain('Não encontramos essa página.')
    expect(html).toContain('Ir para o início')
    expect(html).not.toContain('stack')
  })

  it('/robots.txt contains Disallow: /app/', () => {
    const robotsPath = path.resolve('public/robots.txt')
    expect(fs.existsSync(robotsPath)).toBe(true)
    const robotsContent = fs.readFileSync(robotsPath, 'utf8')
    expect(robotsContent).toContain('Disallow: /app/')
  })
})
