// @vitest-environment happy-dom
import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import axe from 'axe-core'

describe('Automated accessibility (axe-core) tests on public routes', () => {
  let child: ChildProcess
  let baseUrl: string

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
  }, 120000)

  afterAll(() => {
    if (child) {
      child.kill()
    }
  })

  async function testRouteA11y(routePath: string) {
    const res = await fetch(`${baseUrl}${routePath}`)
    expect(res.status).toBe(200)
    const html = await res.text()

    document.documentElement.innerHTML = html

    // Criterion 10: <html lang="pt-BR">
    expect(document.documentElement.getAttribute('lang')).toBe('pt-BR')

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

  it('reports zero critical a11y violations on GET /entrada/:id (entry page)', async () => {
    await testRouteA11y('/entrada/nao-existe')
  })
})
