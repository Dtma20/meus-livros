import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { spawnMock, spawnSyncMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  spawnSyncMock: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
  spawnSync: spawnSyncMock,
}))

vi.mock('../../scripts/seed-genres', () => ({
  seedGenres: vi.fn(),
}))

describe('development bootstrap database logging', () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL_DIRECT', 'postgresql://review_user:alpha:beta@gateway.invalid/books')
    vi.stubEnv('DATABASE_URL', '')
    spawnMock.mockReturnValue(Object.assign(new EventEmitter(), { kill: vi.fn() }))
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('logs only the remote database host, never a fragment of its password', async () => {
    await import('../../scripts/dev')
    await Promise.resolve()

    const output = logSpy.mock.calls.map(([message]: unknown[]) => String(message)).join('\n')
    expect(output).toContain('Usando banco remoto: gateway.invalid')
    expect(output).not.toContain('alpha')
    expect(output).not.toContain('beta')
  })
})
