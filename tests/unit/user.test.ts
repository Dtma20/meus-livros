import { describe, expect, it, vi } from 'vitest'
import authMiddleware from '../../app/middleware/auth'
import {
  createUserSchema,
  handleSchema,
  isReservedHandle,
  transliterateToHandle,
  updateProfileSchema,
  validateHandle,
} from '../../shared/schemas/user'

vi.hoisted(() => {
  const globalScope = globalThis as unknown as Record<string, unknown>
  globalScope.defineNuxtRouteMiddleware = (fn: unknown) => fn
  globalScope.definePageMeta = () => {}
  globalScope.navigateTo = (to: string, options?: Record<string, unknown>) => ({
    path: to,
    ...options,
  })
  // The middleware resolves these before its first await; without them it
  // cannot run outside a Nuxt app.
  globalScope.useNuxtApp = () => ({ runWithContext: (fn: () => unknown) => fn() })
  globalScope.useRequestFetch = () => (globalThis as unknown as Record<string, unknown>).$fetch
})

describe('TASK-008 — Handle validation and transliteration (unit)', () => {
  it('accepts joao_123', () => {
    expect(handleSchema.safeParse('joao_123').success).toBe(true)
    expect(validateHandle('joao_123').valid).toBe(true)
  })

  it('rejects jo (fewer than 3 characters)', () => {
    expect(handleSchema.safeParse('jo').success).toBe(false)
    expect(validateHandle('jo').valid).toBe(false)
  })

  it('rejects João (contains accents and uppercase)', () => {
    expect(handleSchema.safeParse('João').success).toBe(false)
    expect(validateHandle('João').valid).toBe(false)
  })

  it('rejects joao-silva (contains hyphen)', () => {
    expect(handleSchema.safeParse('joao-silva').success).toBe(false)
    expect(validateHandle('joao-silva').valid).toBe(false)
  })

  it('rejects admin (reserved handle)', () => {
    expect(handleSchema.safeParse('admin').success).toBe(false)
    expect(validateHandle('admin').valid).toBe(false)
    expect(isReservedHandle('admin')).toBe(true)
  })

  it('rejects a 21-character string (longer than 20 characters)', () => {
    const string21 = 'a'.repeat(21)
    expect(handleSchema.safeParse(string21).success).toBe(false)
    expect(validateHandle(string21).valid).toBe(false)
  })

  it('rejects all reserved names from the specification', () => {
    const reserved = [
      'livro',
      'entrada',
      'app',
      'api',
      'entrar',
      'admin',
      'sobre',
      'me',
      'sair',
      'perfil',
      'novo',
    ]

    for (const name of reserved) {
      expect(isReservedHandle(name)).toBe(true)
      expect(handleSchema.safeParse(name).success).toBe(false)
    }
  })

  it('transliterates typing João Silva to joao_silva', () => {
    expect(transliterateToHandle('João Silva')).toBe('joao_silva')
  })

  it('transliterates accented and special characters cleanly', () => {
    expect(transliterateToHandle('João')).toBe('joao')
    expect(transliterateToHandle('Ficção Científica')).toBe('ficcao_cientifica')
    expect(transliterateToHandle('  espaços   extras  ')).toBe('espacos_extras')
    expect(transliterateToHandle('2ª Edição!')).toBe('2a_edicao')
  })

  it('truncates transliteration output to 20 characters', () => {
    const longName = 'Nome Extremamente Longo de Teste'
    const result = transliterateToHandle(longName)
    expect(result.length).toBeLessThanOrEqual(20)
    expect(result.endsWith('_')).toBe(false)
  })
})

describe('TASK-008 — Schema validations for POST and PATCH (unit)', () => {
  it('createUserSchema accepts valid handle and display_name', () => {
    const result = createUserSchema.safeParse({
      handle: 'joao_123',
      display_name: 'João Silva',
    })
    expect(result.success).toBe(true)
  })

  it('createUserSchema rejects jo as handle with validation error', () => {
    const result = createUserSchema.safeParse({
      handle: 'jo',
      display_name: 'João Silva',
    })
    expect(result.success).toBe(false)
  })

  it('createUserSchema accepts admin at format level so the route/service can return 409', () => {
    const result = createUserSchema.safeParse({
      handle: 'admin',
      display_name: 'Administrador',
    })
    expect(result.success).toBe(true)
  })

  it('updateProfileSchema accepts valid bio with 500 characters', () => {
    const result = updateProfileSchema.safeParse({
      display_name: 'João Atualizado',
      bio: 'x'.repeat(500),
      profile_visibility: 'privado',
    })
    expect(result.success).toBe(true)
  })

  it('updateProfileSchema rejects a bio of 501 characters', () => {
    const result = updateProfileSchema.safeParse({
      display_name: 'João',
      bio: 'x'.repeat(501),
    })
    expect(result.success).toBe(false)
  })

  it('updateProfileSchema accepts handle field in payload so route can ignore it', () => {
    const result = updateProfileSchema.safeParse({
      display_name: 'João',
      handle: 'hacker_handle',
    })
    expect(result.success).toBe(true)
  })
})

describe('TASK-008 — Route middleware logic (unit)', () => {
  type MiddlewareHandler = (to: { path: string; fullPath: string }) => Promise<unknown> | unknown
  const runMiddleware = authMiddleware as unknown as MiddlewareHandler

  it('redirects unauthenticated users trying to access /app/novo to /entrar', async () => {
    const globalScope = globalThis as unknown as Record<string, unknown>
    globalScope.useState = (_key: string, init?: () => unknown) => ({
      value: init ? init() : { user: null },
    })

    const result = await runMiddleware({ path: '/app/novo', fullPath: '/app/novo' })
    expect(result).toEqual({
      path: '/entrar?next=/app/novo',
      redirectCode: 302,
    })
  })

  it('redirects authenticated users with no profile to /app/bem-vindo when trying to reach /app/novo', async () => {
    const globalScope = globalThis as unknown as Record<string, unknown>
    globalScope.useState = () => ({
      value: {
        user: { id: 'ba_test_user', email: 'test@example.com' },
        hasProfile: false,
      },
    })

    const result = await runMiddleware({ path: '/app/novo', fullPath: '/app/novo' })
    expect(result).toEqual({
      path: '/app/bem-vindo',
      redirectCode: 302,
    })
  })

  it('allows authenticated users with no profile to access /app/bem-vindo without redirect loop', async () => {
    const globalScope = globalThis as unknown as Record<string, unknown>
    globalScope.useState = () => ({
      value: {
        user: { id: 'ba_test_user', email: 'test@example.com' },
        hasProfile: false,
      },
    })

    const result = await runMiddleware({ path: '/app/bem-vindo', fullPath: '/app/bem-vindo' })
    expect(result).toBeUndefined()
  })

  it('allows authenticated users with a profile to reach /app/novo', async () => {
    const globalScope = globalThis as unknown as Record<string, unknown>
    globalScope.useState = () => ({
      value: {
        user: { id: 'uuid-1', handle: 'joao', hasProfile: true },
        hasProfile: true,
      },
    })

    const result = await runMiddleware({ path: '/app/novo', fullPath: '/app/novo' })
    expect(result).toBeUndefined()
  })

  it('middleware fetches from /api/users/me when $fetch is present and session is not cached', async () => {
    const globalScope = globalThis as unknown as Record<string, unknown>
    const sessionRef = { value: { user: null as unknown, fetched: false, hasProfile: false } }
    globalScope.useState = () => sessionRef
    globalScope.$fetch = vi.fn().mockResolvedValue({
      id: 'uuid-42',
      handle: 'maria',
      display_name: 'Maria',
    })

    const resultPromise = await runMiddleware({ path: '/app/novo', fullPath: '/app/novo' })
    const result = await resultPromise
    expect(result).toBeUndefined()
    expect(sessionRef.value.user).toMatchObject({
      id: 'uuid-42',
      handle: 'maria',
      hasProfile: true,
    })

    delete globalScope.$fetch
  })

  it('middleware redirects to /entrar when /api/users/me returns 401', async () => {
    const globalScope = globalThis as unknown as Record<string, unknown>
    const sessionRef = { value: { user: null as unknown, fetched: false, hasProfile: false } }
    globalScope.useState = () => sessionRef
    globalScope.$fetch = vi.fn().mockRejectedValue({ statusCode: 401 })

    const resultPromise = await runMiddleware({ path: '/app/novo', fullPath: '/app/novo' })
    const result = await resultPromise
    expect(result).toEqual({
      path: '/entrar?next=/app/novo',
      redirectCode: 302,
    })

    delete globalScope.$fetch
  })

  it('middleware redirects to /app/bem-vindo when /api/users/me returns null (unprofiled)', async () => {
    const globalScope = globalThis as unknown as Record<string, unknown>
    const sessionRef = { value: { user: null as unknown, fetched: false, hasProfile: false } }
    globalScope.useState = () => sessionRef
    globalScope.$fetch = vi.fn().mockResolvedValue(null)

    const resultPromise = await runMiddleware({ path: '/app/novo', fullPath: '/app/novo' })
    const result = await resultPromise
    expect(result).toEqual({
      path: '/app/bem-vindo',
      redirectCode: 302,
    })

    delete globalScope.$fetch
  })
})
