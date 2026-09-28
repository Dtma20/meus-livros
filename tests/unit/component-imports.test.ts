import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const BUILTIN = new Set([
  'NuxtLink', 'NuxtPage', 'NuxtLayout', 'ClientOnly', 'NuxtRouteAnnouncer', 'NuxtLoadingIndicator',
  'NuxtErrorBoundary', 'Teleport', 'Transition', 'TransitionGroup', 'KeepAlive', 'Suspense',
  'RouterLink', 'RouterView',
])

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return vueFiles(path)
    return entry.endsWith('.vue') ? [path] : []
  })
}

describe('component imports', () => {
  it('every component used in a template is imported or declared in the same file', () => {
    const root = resolve('app')
    const missing = vueFiles(root).flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      const template = source.split('<script')[0] ?? ''
      const used = new Set([...template.matchAll(/<([A-Z][A-Za-z0-9]+)/g)].map((m) => m[1]))
      const declared = new Set([
        ...[...source.matchAll(/import\s+([A-Z][A-Za-z0-9]+)\s+from/g)].map((m) => m[1]),
        ...[...source.matchAll(/const\s+([A-Z][A-Za-z0-9]+)\s*=/g)].map((m) => m[1]),
      ])
      return [...used]
        .filter((name) => name && !declared.has(name) && !BUILTIN.has(name))
        .map((name) => `${relative(root, file)}: ${name}`)
    })
    expect(missing).toEqual([])
  })
})
