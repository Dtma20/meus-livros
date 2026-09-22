// @vitest-environment happy-dom
import http from 'node:http'
import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import axe from 'axe-core'

function httpGet(url: string): Promise<{ status: number, body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    }).on('error', reject)
  })
}

describe('Automated accessibility (axe-core) tests on public routes', () => {
  let child: ChildProcess
  let baseUrl: string
  let entryPath: string | null = null
  let tempEntryLogId: string | null = null

  beforeAll(async () => {
    const env = { ...process.env }
    delete env.NODE_OPTIONS
    delete env.VITEST
    delete env.VITEST_WORKER_ID

    child = spawn('node', [path.resolve('tests/integration/server-runner.mjs')], {
      env,
      stdio: ['ignore', 'pipe', 'inherit'],
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

    const profileRes = await httpGet(`${baseUrl}/@dtma23`)
    // A rota quebrada (500) nunca pode passar em silêncio via fallback do banco.
    expect(profileRes.status).toBe(200)
    const match = profileRes.body.match(/href="(\/entrada\/[^"]+)"/)
    if (match && match[1]) {
      entryPath = match[1]
    } else {
      const dbModule = await import('../../server/db')
      const schemaModule = await import('../../server/db/schema')
      const sqlOp = await import('drizzle-orm')

      const [existing] = await dbModule.db
        .select({ id: schemaModule.reading_logs.id })
        .from(schemaModule.reading_logs)
        .where(sqlOp.eq(schemaModule.reading_logs.visibility, 'publico'))
        .limit(1)

      if (existing) {
        entryPath = `/entrada/${existing.id}`
      } else {
        const [user] = await dbModule.db
          .select({ id: schemaModule.users.id })
          .from(schemaModule.users)
          .where(sqlOp.eq(schemaModule.users.handle, 'dtma23'))
          .limit(1)

        const [work] = await dbModule.db
          .select({ id: schemaModule.works.id })
          .from(schemaModule.works)
          .limit(1)

        if (user && work) {
          const [created] = await dbModule.db
            .insert(schemaModule.reading_logs)
            .values({
              user_id: user.id,
              work_id: work.id,
              rating: '5.0',
              review: 'Entrada de teste para validação de acessibilidade.',
              visibility: 'publico',
            })
            .returning({ id: schemaModule.reading_logs.id })

          if (created) {
            entryPath = `/entrada/${created.id}`
            tempEntryLogId = created.id
          }
        }
      }
    }
  }, 120000)

  afterAll(async () => {
    if (tempEntryLogId) {
      const dbModule = await import('../../server/db')
      const schemaModule = await import('../../server/db/schema')
      const sqlOp = await import('drizzle-orm')
      await dbModule.db
        .delete(schemaModule.reading_logs)
        .where(sqlOp.eq(schemaModule.reading_logs.id, tempEntryLogId))
    }
    if (child) {
      child.kill()
    }
  })

  async function testRouteA11y(routePath: string) {
    const res = await httpGet(`${baseUrl}${routePath}`)
    expect(res.status).toBe(200)
    const html = res.body

    // Criterion 10: <html lang="pt-BR"> in SSR response
    expect(html).toMatch(/<html[^>]*\blang="pt-BR"/i)

    document.documentElement.removeAttribute('lang')
    document.documentElement.innerHTML = html
    document.documentElement.setAttribute('lang', 'pt-BR')

    // Criterion 2: Every <img> in rendered output has an alt attribute
    const images = Array.from(document.querySelectorAll('img'))
    for (const img of images) {
      expect(img.hasAttribute('alt')).toBe(true)
    }

    // Criterion 8: axe-core reports zero critical violations
    const results = await axe.run(document.documentElement, {
      rules: {
        // happy-dom lacks layout and CSS computation engine for color-contrast evaluation
        'color-contrast': { enabled: false },
      },
    })

    const criticalViolations = results.violations.filter((v) => v.impact === 'critical')
    expect(criticalViolations).toEqual([])
  }

  it('reports zero critical a11y violations on GET / (home)', async () => {
    await testRouteA11y('/')
  })

  it('reports zero critical a11y violations on GET /@dtma23 (profile)', async () => {
    await testRouteA11y('/@dtma23')
  })

  it('reports zero critical a11y violations on GET /livro/1984 (work page)', async () => {
    await testRouteA11y('/livro/1984')
  })

  it('reports zero critical a11y violations on GET /entrada/:id (real entry page)', async () => {
    expect(entryPath).toBeTruthy()
    await testRouteA11y(entryPath!)
  })

  it('reports zero critical a11y violations on GET /entrada/nao-existe (empty state)', async () => {
    await testRouteA11y('/entrada/nao-existe')
  })
})
