import { createServer, type Server } from 'node:http'
import { createApp, defineEventHandler, toNodeListener } from 'h3'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  checkOtpRequestLimit,
  checkRateLimit,
  checkSignInAccountLimit,
  hashRateLimitKey,
  pruneRateLimits,
} from '../../server/services/rate-limit'
import importHandler from '../../server/api/library/import.post'
import { livroJsonSchema } from '../../shared/schemas/export-import'
import { deleteRateLimits, removeFixtures, uniqueTestIp } from './fixtures'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)
const MARKER = `zz-ratelimit-${Date.now()}`

describe.skipIf(!hasDatabaseUrl)('TASK-067 - Rate limit hardening', () => {
  let db: typeof import('../../server/db')['db']
  let client: typeof import('../../server/db')['client']
  let schema: typeof import('../../server/db/schema')
  let server: Server
  let serverUrl: string
  let testUserId: string
  const testId = Date.now()
  const testRateLimitKeys: string[] = []

  beforeAll(async () => {
    const dbModule = await import('../../server/db')
    db = dbModule.db
    client = dbModule.client
    schema = await import('../../server/db/schema')

    const [user] = await db
      .insert(schema.users)
      .values({
        email: `${MARKER}@example.com`,
        handle: `rl_${testId}`.slice(0, 20),
        display_name: 'Usuário Rate Limit',
        profile_visibility: 'publico',
      })
      .returning({ id: schema.users.id })

    if (!user) throw new Error('Falha ao criar usuário de teste.')
    testUserId = user.id

    const app = createApp()
    app.use(
      defineEventHandler((event) => {
        const userId = event.headers.get('x-test-user-id')
        if (userId) {
          event.context.user = { id: userId, email: `${userId}@test.invalid` }
        }
      }),
    )
    app.use('/api/library/import', importHandler)

    server = createServer(toNodeListener(app))
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    serverUrl = `http://127.0.0.1:${port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })

    try {
      await removeFixtures(MARKER)
      await deleteRateLimits(testRateLimitKeys)
    } finally {
      await client?.end()
    }
  })

  it('accepts a 5,000-character key and stores it as a 64 hex character hash', async () => {
    const longKey = `long-key-${testId}-${'x'.repeat(5000)}`
    const allowed = await checkRateLimit(longKey, 10)
    expect(allowed).toBe(true)

    const expectedHash = hashRateLimitKey(longKey)
    expect(expectedHash).toHaveLength(64)
    expect(expectedHash).toMatch(/^[0-9a-f]{64}$/)
    testRateLimitKeys.push(expectedHash)

    const [row] = await db.execute(sql<{ key: string; count: number }>`
      SELECT key, count FROM rate_limit
      WHERE key = ${expectedHash}
        AND window_start = date_trunc('hour', now())
    `)
    expect(row).toBeDefined()
    expect(row?.key).toBe(expectedHash)
    expect(row?.key).toHaveLength(64)
    expect(Number(row?.count)).toBe(1)
  })

  it('inserts no identifier row when the IP bucket is already over in checkOtpRequestLimit', async () => {
    const testIp = uniqueTestIp()
    const testEmail = `test-otp-${testId}@example.com`
    const ipKey = `otp:ip:${testIp}`
    const emailKey = `otp:email:${testEmail}`
    const hashedIpKey = hashRateLimitKey(ipKey)
    const hashedEmailKey = hashRateLimitKey(emailKey)
    testRateLimitKeys.push(hashedIpKey, hashedEmailKey)

    await db.execute(sql`
      INSERT INTO rate_limit (key, count, window_start)
      VALUES (${hashedIpKey}, 20, date_trunc('hour', now()))
      ON CONFLICT (key, window_start) DO UPDATE SET count = 20
    `)

    const result = await checkOtpRequestLimit(testEmail, testIp)
    expect(result).not.toBeNull()
    expect(result?.error).toBe('muitas_tentativas')

    const [emailRow] = await db.execute(sql<{ count: number }>`
      SELECT count FROM rate_limit
      WHERE key = ${hashedEmailKey}
        AND window_start = date_trunc('hour', now())
    `)
    expect(emailRow).toBeUndefined()
  })

  it('pruneRateLimits() deletes a row from two days ago and keeps one from the current hour', async () => {
    const oldKey = hashRateLimitKey(`cleanup:old:${testId}`)
    const currentKey = hashRateLimitKey(`cleanup:current:${testId}`)
    testRateLimitKeys.push(oldKey, currentKey)

    await db.execute(sql`
      INSERT INTO rate_limit (key, count, window_start)
      VALUES (${oldKey}, 3, date_trunc('hour', now()) - interval '2 days')
      ON CONFLICT (key, window_start) DO UPDATE SET count = 3
    `)

    await db.execute(sql`
      INSERT INTO rate_limit (key, count, window_start)
      VALUES (${currentKey}, 3, date_trunc('hour', now()))
      ON CONFLICT (key, window_start) DO UPDATE SET count = 3
    `)

    await pruneRateLimits()

    const oldRows = await db.execute(sql<{ key: string }>`
      SELECT key FROM rate_limit WHERE key = ${oldKey}
    `)
    expect(oldRows).toHaveLength(0)

    const currentRows = await db.execute(sql<{ key: string }>`
      SELECT key FROM rate_limit WHERE key = ${currentKey}
    `)
    expect(currentRows).toHaveLength(1)
  })

  it('10 failed sign-ins for identifier X from IP A: 11th from A is 429, first from IP B is not', async () => {
    const identifier = `user_target_${testId}`
    const ipA = uniqueTestIp()
    const ipB = uniqueTestIp()

    testRateLimitKeys.push(
      hashRateLimitKey(`signin:ip:${ipA}`),
      hashRateLimitKey(`signin:ip:${ipB}`),
      hashRateLimitKey(`signin:id:${identifier}`),
      hashRateLimitKey(`signin:idip:${identifier}:${ipA}`),
      hashRateLimitKey(`signin:idip:${identifier}:${ipB}`),
    )

    for (let i = 0; i < 10; i++) {
      const res = await checkSignInAccountLimit(identifier, ipA)
      expect(res).toBeNull()
    }

    const eleventhA = await checkSignInAccountLimit(identifier, ipA)
    expect(eleventhA).not.toBeNull()
    expect(eleventhA?.error).toBe('muitas_tentativas')

    const firstB = await checkSignInAccountLimit(identifier, ipB)
    expect(firstB).toBeNull()
  })

  it('the 4th import within an hour for one user returns 429 and creates no work', async () => {
    const importUserKey = hashRateLimitKey(`import:user:${testUserId}`)
    testRateLimitKeys.push(importUserKey)

    const makeBook = (n: number) => ({
      title: `${MARKER} Livro ${n}`,
      author: 'Autor Teste Import',
      genre: ['Ficção'],
    })

    for (let i = 1; i <= 3; i++) {
      const res = await fetch(`${serverUrl}/api/library/import`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-test-user-id': testUserId,
        },
        body: JSON.stringify([makeBook(i)]),
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { imported: number }
      expect(data.imported).toBe(1)
    }

    const fourthTitle = `${MARKER} Livro 4 Nao Criado`
    const fourthRes = await fetch(`${serverUrl}/api/library/import`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': testUserId,
      },
      body: JSON.stringify([
        {
          title: fourthTitle,
          author: 'Autor Teste Import',
          genre: ['Ficção'],
        },
      ]),
    })

    expect(fourthRes.status).toBe(429)
    const errorBody = (await fourthRes.json()) as {
      data?: { error: string; message: string }
      error?: string
      message?: string
    }
    const errCode = errorBody.data?.error ?? errorBody.error
    const errMsg = errorBody.data?.message ?? errorBody.message
    expect(errCode).toBe('muitas_tentativas')
    expect(errMsg).toBe('Muitas importações em pouco tempo. Tente de novo daqui a uma hora.')

    const [uncreatedWork] = await db
      .select({ id: schema.works.id })
      .from(schema.works)
      .where(eq(schema.works.title, fourthTitle))
    expect(uncreatedWork).toBeUndefined()
  })

  it('livroJsonSchema rejects a 301-character title and accepts a 300-character title', () => {
    const validResult = livroJsonSchema.safeParse({
      title: 'a'.repeat(300),
      author: 'Autor Valido',
      genre: [],
    })
    expect(validResult.success).toBe(true)

    const invalidResult = livroJsonSchema.safeParse({
      title: 'a'.repeat(301),
      author: 'Autor Invalido',
      genre: [],
    })
    expect(invalidResult.success).toBe(false)
  })

  it('3 malformed import submissions followed by 1 valid submission: valid submission does not receive 429', async () => {
    const malformedTestUser = await db
      .insert(schema.users)
      .values({
        email: `${MARKER}-malformed@example.com`,
        handle: `mf_${Date.now()}`.slice(0, 20),
        display_name: 'Usuário Malformado',
        profile_visibility: 'publico',
      })
      .returning({ id: schema.users.id })

    const mfUserId = malformedTestUser[0]!.id
    const userLimitKey = hashRateLimitKey(`import:user:${mfUserId}`)
    testRateLimitKeys.push(userLimitKey)

    // 3 malformed submissions (invalid schema, missing title/author)
    for (let i = 1; i <= 3; i++) {
      const badRes = await fetch(`${serverUrl}/api/library/import`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-test-user-id': mfUserId,
        },
        body: JSON.stringify([{ invalid_field: true }]),
      })
      expect(badRes.status).toBe(400)
    }

    // 1 valid submission right after
    const validTitle = `${MARKER} Livro Apos 3 Malformados`
    const validRes = await fetch(`${serverUrl}/api/library/import`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': mfUserId,
      },
      body: JSON.stringify([
        {
          title: validTitle,
          author: 'Autor Valido',
          genre: ['Ficção'],
        },
      ]),
    })

    expect(validRes.status).not.toBe(429)
    expect(validRes.status).toBe(200)
    const validData = (await validRes.json()) as { imported: number }
    expect(validData.imported).toBe(1)
  })
})

describe.skipIf(!hasDatabaseUrl)('Escrita autenticada: 200 por usuário por hora (security.md §8)', () => {
  let db: typeof import('../../server/db')['db']
  let client: typeof import('../../server/db')['client']
  let schema: typeof import('../../server/db/schema')
  let server: Server
  let serverUrl: string
  let writerId: string
  const writerMarker = `zz-ratelimit-write-${Date.now()}`
  const writerRateLimitKeys: string[] = []

  beforeAll(async () => {
    // The describe above ends the shared postgres client in its afterAll, so this block
    // loads fresh modules instead of reusing the closed connection.
    const { vi } = await import('vitest')
    vi.resetModules()
    const dbModule = await import('../../server/db')
    db = dbModule.db
    client = dbModule.client
    schema = await import('../../server/db/schema')
    const { default: profilePatch } = await import('../../server/api/users/me.patch')

    const [writer] = await db
      .insert(schema.users)
      .values({
        email: `${writerMarker}@example.com`,
        handle: `rw_${Date.now()}`.slice(0, 20),
        display_name: 'Usuário de escrita',
        profile_visibility: 'publico',
      })
      .returning({ id: schema.users.id })

    if (!writer) throw new Error('Falha ao criar usuário de teste de escrita.')
    writerId = writer.id

    const app = createApp()
    app.use(
      defineEventHandler((event) => {
        const userId = event.headers.get('x-test-user-id')
        if (userId) {
          event.context.user = { id: userId, email: `${userId}@test.invalid` }
        }
      }),
    )
    app.use('/api/users/me', profilePatch)

    server = createServer(toNodeListener(app))
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    serverUrl = `http://127.0.0.1:${port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })

    try {
      await removeFixtures(writerMarker)
      await deleteRateLimits(writerRateLimitKeys)
    } finally {
      await client?.end()
    }
  })

  it('200 authenticated PATCH /api/users/me pass and the 201st in the hour returns 429', async () => {
    writerRateLimitKeys.push(hashRateLimitKey(`write:email:${writerId}@test.invalid`))

    const patch = (bio: string) =>
      fetch(`${serverUrl}/api/users/me`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-test-user-id': writerId,
        },
        body: JSON.stringify({ bio }),
      })

    for (let i = 1; i <= 200; i++) {
      const res = await patch(`Biografia ${i}`)
      expect(res.status, `PATCH número ${i}`).toBe(200)
    }

    const limited = await patch('Biografia 201')
    expect(limited.status).toBe(429)
    const body = (await limited.json()) as { error?: string; message?: string }
    expect(body.error).toBe('muitas_tentativas')
    expect(body.message).toBe('Muitas ações em pouco tempo. Aguarde e tente novamente.')
  }, 120_000)
})

describe.skipIf(!hasDatabaseUrl)('Escrita autenticada: limite na criacao de perfil (POST /api/users)', () => {
  let db: typeof import('../../server/db')['db']
  let client: typeof import('../../server/db')['client']
  let server: Server
  let serverUrl: string
  const writerMarker = `zz-rl-create-user-${Date.now()}`
  const testBaUserId = `ba_${Date.now()}`
  const writerRateLimitKeys: string[] = []
  let auth: typeof import('../../server/services/auth')['auth']
  let getSessionSpy: import('vitest').MockInstance

  beforeAll(async () => {
    const { vi } = await import('vitest')
    vi.resetModules()
    const dbModule = await import('../../server/db')
    db = dbModule.db
    client = dbModule.client
    const { default: createUserHandler } = await import('../../server/api/users/index.post')
    const authModule = await import('../../server/services/auth')
    auth = authModule.auth

    getSessionSpy = vi.spyOn(auth.api, 'getSession').mockImplementation(async () => {
      return {
        session: {} as Record<string, unknown>,
        user: { id: testBaUserId, email: `${writerMarker}@example.com` } as Record<string, unknown>
      } as unknown as { session: import('better-auth').Session; user: import('better-auth').User }
    })

    const app = createApp()
    app.use(
      defineEventHandler((event) => {
        const testContextEmail = event.headers.get('x-test-context-email')
        if (testContextEmail) {
          event.context.user = { email: testContextEmail, id: 'test-ctx-user' }
        }
      }),
    )
    app.use('/api/users', createUserHandler)

    server = createServer(toNodeListener(app))
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    serverUrl = `http://127.0.0.1:${port}`
  })

  afterAll(async () => {
    getSessionSpy?.mockRestore()
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })

    try {
      await removeFixtures(writerMarker)
      await deleteRateLimits(writerRateLimitKeys)
    } finally {
      await client?.end()
    }
  })

  it('200 authenticated POST /api/users pass and the 201st in the hour returns 429', async () => {
    const userEmail = `${writerMarker}@example.com`
    writerRateLimitKeys.push(hashRateLimitKey(`write:email:${userEmail}`))

    const postUser = (handle: string) =>
      fetch(`${serverUrl}/api/users`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ handle, display_name: 'Usuário Rate Limit' }),
      })

    await db.execute(sql`
      INSERT INTO rate_limit (key, count, window_start)
      VALUES (${hashRateLimitKey(`write:email:${userEmail}`)}, 200, date_trunc('hour', now()))
      ON CONFLICT (key, window_start) DO UPDATE SET count = 200
    `)

    const limited = await postUser(`rw_${Date.now() % 100000}`)
    expect(limited.status).toBe(429)
    const body = (await limited.json()) as { error?: string; message?: string }
    expect(body.error).toBe('muitas_tentativas')
    expect(body.message).toBe('Muitas ações em pouco tempo. Aguarde e tente novamente.')
  }, 120_000)

  it('POST /api/users with event.context.user set enforces write budget and returns 429 when budget is exhausted', async () => {
    const contextEmail = `ctx-${writerMarker}@example.com`
    writerRateLimitKeys.push(hashRateLimitKey(`write:email:${contextEmail}`))

    await db.execute(sql`
      INSERT INTO rate_limit (key, count, window_start)
      VALUES (${hashRateLimitKey(`write:email:${contextEmail}`)}, 200, date_trunc('hour', now()))
      ON CONFLICT (key, window_start) DO UPDATE SET count = 200
    `)

    const res = await fetch(`${serverUrl}/api/users`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-context-email': contextEmail,
      },
      body: JSON.stringify({ handle: `ctx_${Date.now() % 100000}`, display_name: 'Usuário Context' }),
    })

    expect(res.status).toBe(429)
    const body = (await res.json()) as { error?: string; message?: string }
    expect(body.error).toBe('muitas_tentativas')
    expect(body.message).toBe('Muitas ações em pouco tempo. Aguarde e tente novamente.')
  }, 120_000)
})

describe.skipIf(!hasDatabaseUrl)('Orçamento de escrita: chave unificada por email entre fluxos ba e requireSessionUser', () => {
  let client: typeof import('../../server/db')['client']
  let server: Server
  let serverUrl: string
  const sharedMarker = `zz-rl-unified-${Date.now()}`
  const sharedEmail = `${sharedMarker}@example.com`
  const sharedRateLimitKeys: string[] = []

  beforeAll(async () => {
    const { vi } = await import('vitest')
    vi.resetModules()
    const dbModule = await import('../../server/db')
    client = dbModule.client
    const { requireSessionUser } = await import('../../server/utils/session')
    const { defineApiHandler } = await import('../../server/utils/api')

    const app = createApp()
    app.use(
      defineEventHandler((event) => {
        const userId = event.headers.get('x-test-user-id')
        if (userId) {
          event.context.user = { id: userId, email: sharedEmail }
        }
      }),
    )
    app.use(
      '/api/test-session-write',
      defineApiHandler(async (event) => {
        await requireSessionUser(event)
        return { ok: true }
      }),
    )

    server = createServer(toNodeListener(app))
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    serverUrl = `http://127.0.0.1:${port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })

    try {
      await deleteRateLimits(sharedRateLimitKeys)
    } finally {
      await client?.end()
    }
  })

  it('2 escritas pelo fluxo ba mais 198 por requireSessionUser sao aceitas; a 201a retorna 429', async () => {
    const { assertWriteBudget } = await import('../../server/utils/session')
    sharedRateLimitKeys.push(hashRateLimitKey(`write:email:${sharedEmail}`))

    // 2 escritas simulando fluxo BA (assertWriteBudget com o email normalizado, inclusive testando trim e maiusculas)
    await assertWriteBudget(`  ${sharedEmail.toUpperCase()}  `)
    await assertWriteBudget(sharedEmail)

    const sessionWrite = () =>
      fetch(`${serverUrl}/api/test-session-write`, {
        method: 'POST',
        headers: {
          'x-test-user-id': `usr_${Date.now()}`,
        },
      })

    // 198 escritas via requireSessionUser sao aceitas
    for (let i = 1; i <= 198; i++) {
      const res = await sessionWrite()
      expect(res.status, `Escrita ${i} de 198 via requireSessionUser`).toBe(200)
    }

    // A 199a chamada via requireSessionUser (201a no total para este email) atinge o teto e recebe 429
    const limited = await sessionWrite()
    expect(limited.status).toBe(429)
    const body = (await limited.json()) as { error?: string; message?: string }
    expect(body.error).toBe('muitas_tentativas')
    expect(body.message).toBe('Muitas ações em pouco tempo. Aguarde e tente novamente.')
  }, 120_000)
})
