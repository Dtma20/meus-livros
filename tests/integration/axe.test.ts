import { createHash } from 'node:crypto'
import http from 'node:http'
import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import axe from 'axe-core'
import type { Window as HappyDOMWindow } from 'happy-dom'
import { stopServer, waitForServerPort } from './server-process'
import { removeFixtures, uniqueTestIp } from './fixtures'

function httpGet(url: string, cookie?: string): Promise<{ status: number, body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, cookie ? { headers: { cookie } } : {}, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    }).on('error', reject)
  })
}

function httpPostJson(
  url: string,
  body: Record<string, string>,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number, body: string, cookies: string[] }> {
  return new Promise((resolve, reject) => {
    const request = http.request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...extraHeaders },
    }, (res) => {
      let responseBody = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { responseBody += chunk })
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'] ?? []
        const cookies = Array.isArray(setCookie) ? setCookie : [setCookie]
        resolve({
          status: res.statusCode ?? 0,
          body: responseBody,
          cookies: cookies.map((cookie) => cookie.split(';', 1)[0] ?? '').filter(Boolean),
        })
      })
    })
    request.on('error', reject)
    request.end(JSON.stringify(body))
  })
}

const WCAG_21_A_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

describe('Automated accessibility (axe-core) tests on rendered routes', () => {
  let child: ChildProcess | null = null
  let baseUrl = ''
  let entryPath: string | null = null
  let sessionCookie = ''
  let fixtureUserId: string | null = null

  const workMarker = `zz-teste-axe-${Date.now()}`
  const fixtureEmail = `${workMarker}@example.invalid`
  const fixtureHandle = `axe_${Date.now() % 10000000}`
  const signInIp = uniqueTestIp()
  const browserSettings = (window as unknown as HappyDOMWindow).happyDOM.settings
  const originalLoading = {
    disableCSSFileLoading: browserSettings.disableCSSFileLoading,
    disableJavaScriptFileLoading: browserSettings.disableJavaScriptFileLoading,
    handleDisabledFileLoadingAsSuccess: browserSettings.handleDisabledFileLoadingAsSuccess,
  }
  let workPath: string | null = null

  beforeAll(async () => {
    // axe checks SSR semantics here; remote CSS/JS and rendered contrast need a real browser.
    browserSettings.disableCSSFileLoading = true
    browserSettings.disableJavaScriptFileLoading = true
    browserSettings.handleDisabledFileLoadingAsSuccess = true
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
    const [user] = await dbModule.db
      .insert(schemaModule.users)
      .values({
        email: fixtureEmail,
        handle: fixtureHandle,
        display_name: 'Usuário Teste de Acessibilidade',
        profile_visibility: 'publico',
      })
      .returning({ id: schemaModule.users.id })
    if (!user) throw new Error('Não foi possível criar o usuário fixture de acessibilidade.')
    fixtureUserId = user.id
    await dbModule.db.insert(schemaModule.allowed_emails).values({
      email: fixtureEmail,
      note: `${workMarker} fixture de acessibilidade`,
    })

    const [work] = await dbModule.db
      .insert(schemaModule.works)
      .values({ slug: workMarker, title: `${workMarker} Obra`, created_by: fixtureUserId })
      .returning({ id: schemaModule.works.id, slug: schemaModule.works.slug })
    if (!work) throw new Error('Não foi possível criar a obra fixture de acessibilidade.')
    workPath = `/livro/${encodeURIComponent(work.slug)}`

    const [log] = await dbModule.db
      .insert(schemaModule.reading_logs)
      .values({
        user_id: fixtureUserId,
        work_id: work.id,
        rating: '5.0',
        review: 'Entrada de teste para validação de acessibilidade.',
        visibility: 'publico',
      })
      .returning({ id: schemaModule.reading_logs.id })
    if (!log) throw new Error('Não foi possível criar a entrada fixture de acessibilidade.')
    entryPath = `/entrada/${log.id}`

    const { auth } = await import('../../server/services/auth')
    const signUpRes = await auth.api.signUpEmail({
      body: {
        name: 'Usuário Teste de Acessibilidade',
        email: fixtureEmail,
        password: 'AxeFixturePassword2026!',
      },
      asResponse: true,
    })
    expect(signUpRes.status).toBe(200)

    const signInRes = await httpPostJson(`${baseUrl}/api/auth/entrar`, {
      identificador: fixtureEmail,
      senha: 'AxeFixturePassword2026!',
    }, { 'x-forwarded-for': signInIp })
    expect(signInRes.status, signInRes.body).toBe(200)
    expect(signInRes.cookies.length).toBeGreaterThan(0)
    sessionCookie = signInRes.cookies.join('; ')
  }, 120000)

  afterAll(async () => {
    try {
      const dbModule = await import('../../server/db')
      const sqlModule = await import('drizzle-orm')
      const authUsers = await dbModule.db.execute(sqlModule.sql<{ id: string }>`
        SELECT id FROM ba_user WHERE email = ${fixtureEmail}
      `)
      const authUserIds = authUsers.map((row) => row.id)
      if (authUserIds.length > 0) {
        const authUserIdValues = authUserIds.map((id) => sqlModule.sql`${id}`)
        const authUserIdList = sqlModule.sql.join(authUserIdValues, sqlModule.sql`, `)
        await dbModule.db.execute(sqlModule.sql`
          DELETE FROM session WHERE "userId" IN (${authUserIdList})
        `)
        await dbModule.db.execute(sqlModule.sql`
          DELETE FROM account WHERE "userId" IN (${authUserIdList})
        `)
        await dbModule.db.execute(sqlModule.sql`
          DELETE FROM ba_user WHERE id IN (${authUserIdList})
        `)
      }
      await dbModule.db.execute(sqlModule.sql`DELETE FROM verification WHERE identifier = ${fixtureEmail}`)

      const rateLimitKeys = [
        `signin:ip:${signInIp}`,
        `signin:idip:${fixtureEmail}:${signInIp}`,
        `signin:id:${fixtureEmail}`,
      ].map((key) => createHash('sha256').update(key).digest('hex'))
      const rateLimitValues = rateLimitKeys.map((key) => sqlModule.sql`${key}`)
      await dbModule.db.execute(sqlModule.sql`
        DELETE FROM rate_limit WHERE key IN (${sqlModule.sql.join(rateLimitValues, sqlModule.sql`, `)})
      `)
      await removeFixtures(workMarker, [fixtureUserId])
    } finally {
      try { await stopServer(child) } finally { Object.assign(browserSettings, originalLoading) }
    }
  })

  function serverUrl(pathname: string): string {
    if (!baseUrl) throw new Error('O servidor de integração ainda não foi iniciado.')
    return `${baseUrl}${pathname}`
  }

  async function testRouteA11y(routePath: string, cookie?: string) {
    const res = await httpGet(serverUrl(routePath), cookie)
    expect(res.status, `${routePath}\n${res.body.slice(0, 1000)}`).toBe(200)
    const html = res.body

    expect(html).toMatch(/<html[^>]*\blang="pt-BR"/i)

    document.documentElement.removeAttribute('lang')
    document.documentElement.innerHTML = html
    document.documentElement.setAttribute('lang', 'pt-BR')

    // Parsed SSR markup is checked for semantics only; happy-dom cannot verify rendered contrast.
    const results = await axe.run(document.documentElement, {
      runOnly: { type: 'tag', values: WCAG_21_A_AA_TAGS },
      rules: { 'color-contrast': { enabled: false } },
    })

    const violations = results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      helpUrl: violation.helpUrl,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        html: node.html,
        failureSummary: node.failureSummary,
      })),
    }))
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([])
  }

  it('reports zero WCAG 2.1 A/AA violations on GET / (home)', async () => {
    await testRouteA11y('/')
  })

  it('reports zero WCAG 2.1 A/AA violations on the fixture profile', async () => {
    await testRouteA11y(`/@${fixtureHandle}`)
  })

  it('reports zero WCAG 2.1 A/AA violations on GET /livro/<slug fixture> (work page)', async () => {
    expect(workPath).toBeTruthy()
    await testRouteA11y(workPath!)
  })

  it('reports zero WCAG 2.1 A/AA violations on GET /entrada/:id (fixture entry page)', async () => {
    expect(entryPath).toBeTruthy()
    await testRouteA11y(entryPath!)
  })

  it('reports zero WCAG 2.1 A/AA violations on GET /entrada/nao-existe (empty state)', async () => {
    await testRouteA11y('/entrada/nao-existe')
  })

  it('reports zero WCAG 2.1 A/AA violations on GET /entrar (sign-in)', async () => {
    await testRouteA11y('/entrar')
  })

  it('reports zero WCAG 2.1 A/AA violations on authenticated GET /atividade', async () => {
    await testRouteA11y('/atividade', sessionCookie)
  })

  it('reports zero WCAG 2.1 A/AA violations on authenticated GET /membros', async () => {
    await testRouteA11y('/membros', sessionCookie)
  })
})
