import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { visibleLogs } from '../../server/services/visibility'

describe('server/services/visibility.ts - visibleLogs unit contract', () => {
  it('requires exactly 1 parameter (viewer is mandatory)', () => {
    // TypeScript compiles visibleLogs(viewer: Viewer).
    // In JavaScript, function.length reports the number of formal parameters before the first default.
    expect(visibleLogs.length).toBe(1)
  })

  it('throws TypeError if viewer is undefined at runtime', () => {
    // Protects against callers passing undefined from un-typed code or runtime omissions
    // @ts-expect-error - testing runtime defense against undefined
    expect(() => visibleLogs(undefined)).toThrow(TypeError)
    // @ts-expect-error - testing runtime defense against 0 arguments
    expect(() => visibleLogs()).toThrow(TypeError)
  })

  it('accepts null for unauthenticated / anonymous viewers', () => {
    const condition = visibleLogs(null)
    expect(condition).toBeDefined()
    expect(typeof condition).toBe('object')
  })

  it('accepts { id: string } for authenticated viewers', () => {
    const condition = visibleLogs({ id: '123e4567-e89b-12d3-a456-426614174000' })
    expect(condition).toBeDefined()
    expect(typeof condition).toBe('object')
  })
})

describe('Architecture & Boundary rules - Visibility and db imports', () => {
  it('eslint.config.mjs forbids importing server/db outside server/services/**', () => {
    const configContent = fs.readFileSync(path.resolve('eslint.config.mjs'), 'utf-8')
    expect(configContent).toContain('@typescript-eslint/no-restricted-imports')
    expect(configContent).toContain('server/services/**')
    expect(configContent).toContain('server/db/**')
    expect(configContent).toContain('O handle de banco de dados só pode ser importado dentro de server/services/**')
  })

  it('no route in server/api/ imports directly from server/db', () => {
    function getFiles(dir: string): string[] {
      const results: string[] = []
      if (!fs.existsSync(dir)) return results
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          results.push(...getFiles(full))
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) {
          results.push(full)
        }
      }
      return results
    }

    const apiFiles = getFiles(path.resolve('server/api'))
    for (const file of apiFiles) {
      const content = fs.readFileSync(file, 'utf-8')
      expect(content).not.toMatch(/from\s+['"][^'"]*\/db(\/index)?['"]/)
    }
  })

  it('server/services/logs.ts uses visibleLogs for getLogById', () => {
    const logsContent = fs.readFileSync(path.resolve('server/services/logs.ts'), 'utf-8')
    expect(logsContent).toContain("import { visibleLogs, type Viewer } from './visibility'")
    expect(logsContent).toContain('visibleLogs(viewer)')
  })

  it('server/api/logs/[id].get.ts passes viewer to getLogById', () => {
    const routeContent = fs.readFileSync(path.resolve('server/api/logs/[id].get.ts'), 'utf-8')
    expect(routeContent).toContain('const viewer = user ? { id: user.id } : null')
    expect(routeContent).toContain('getLogById(parsed.data, viewer)')
  })
})
