import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(vue|ts)$/.test(entry) ? [path] : []
  })
}

describe('session cookie on the client', () => {
  it('no app code hands the httpOnly session cookie to useCookie', () => {
    const offenders = sourceFiles(resolve('app')).filter((file) =>
      /useCookie\([^)]*session_token/.test(readFileSync(file, 'utf8')),
    )
    expect(offenders).toEqual([])
  })
})
